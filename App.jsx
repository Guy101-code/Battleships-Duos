import React, { useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  update,
  get,
} from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

import "./App.css";
// 🧩 Replace with your Firebase config here:
const firebaseConfig = {
  apiKey: "AIzaSyC5C4mlRfpd2cM0gMqTcq_ERrVdYnTPA7I",
  authDomain: "battleships-cc040.firebaseapp.com",
  databaseURL: "https://battleships-cc040-default-rtdb.firebaseio.com",
  projectId: "battleships-cc040",
  storageBucket: "battleships-cc040.firebasestorage.app",
  messagingSenderId: "511743617639",
  appId: "1:511743617639:web:f4408354809cadd69242c2"
};

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);

const makeEmptyBoard = () => Array(10).fill(null).map(() => Array(10).fill(0));

const placeShipsRandomly = (board) => {
  const ships = [5, 4, 3, 3, 2];
  const b = board.map(r => r.slice());
  const fits = (r, c, len, horiz) => {
    if (horiz) {
      if (c + len > 10) return false;
      for (let i = 0; i < len; i++) if (b[r][c + i] === 1) return false;
    } else {
      if (r + len > 10) return false;
      for (let i = 0; i < len; i++) if (b[r + i][c] === 1) return false;
    }
    return true;
  };
  for (const len of ships) {
    let placed = false;
    for (let tries = 0; tries < 500 && !placed; tries++) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * 10);
      const c = Math.floor(Math.random() * 10);
      if (!fits(r, c, len, horiz)) continue;
      for (let i = 0; i < len; i++) {
        if (horiz) b[r][c + i] = 1; else b[r + i][c] = 1;
      }
      placed = true;
    }
    if (!placed) return placeShipsRandomly(makeEmptyBoard());
  }
  return b;
};

const uid = () => Math.random().toString(36).slice(2, 9);

export default function App() {
  const [playerId] = useState(uid);
  const [roomId, setRoomId] = useState(null);
  const [role, setRole] = useState(null);
  const [game, setGame] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get("game");
    if (q) {
      setRoomId(q);
      setRole("guest");
      joinRoom(q);
    }
  }, []);

  const createRoom = async () => {
    const roomRef = push(ref(db, "games"));
    const id = roomRef.key;
    const hostBoard = placeShipsRandomly(makeEmptyBoard());
    const guestBoard = placeShipsRandomly(makeEmptyBoard());

    const initial = {
      host: { id: playerId, ready: true },
      guest: { id: null, ready: false },
      boards: { host: hostBoard, guest: guestBoard },
      moves: [],
      turn: "host",
      createdAt: Date.now(),
      state: "waiting",
    };

    await set(roomRef, initial);
    const url = window.location.origin + window.location.pathname + "?game=" + id;
    await navigator.clipboard.writeText(url).catch(() => {});
    setRoomId(id);
    setRole("host");
    setStatus("waiting");
    watchRoom(id);
    alert("Share this link with your friend:\n" + url);
  };

  const joinRoom = async (id) => {
    const r = ref(db, `games/${id}`);
    const snap = await get(r);
    if (!snap.exists()) {
      alert("Room not found");
      setStatus("idle");
      return;
    }
    const data = snap.val();
    if (data.guest && data.guest.id) {
      alert("This room already has a guest.");
      setStatus("idle");
      return;
    }
    await update(r, { "guest/id": playerId, "guest/ready": true, state: "ready" });
    watchRoom(id);
    setStatus("ready");
  };

  const watchRoom = (id) => {
    const r = ref(db, `games/${id}`);
    onValue(r, (snap) => {
      const v = snap.val();
      setGame(v);
      if (!v) return;
      setRoomId(id);
      if (!role) setRole(playerId === v.host?.id ? "host" : "guest");
      if (v.state === "finished") setStatus("finished");
      else if (v.guest?.id && v.host?.id) setStatus("playing");
    });
  };

  const makeMove = async (r, c) => {
    if (!roomId || !game) return;
    const myRole = role;
    const turn = game.turn;
    if (myRole !== turn) return;
    const targetSide = myRole === "host" ? "guest" : "host";
    if (game.moves?.some((m) => m.r === r && m.c === c)) return;

    const cellVal = game.boards[targetSide][r][c];
    const hit = cellVal === 1;

    const move = { r, c, by: myRole, hit, at: Date.now() };
    const nextTurn = hit ? myRole : myRole === "host" ? "guest" : "host";

    const updates = {};
    updates[`games/${roomId}/moves/${(game.moves || []).length}`] = move;
    updates[`games/${roomId}/turn`] = nextTurn;

    await update(ref(db), updates);
  };

  const renderGrid = (who, isOpponent) => {
    const board = game?.boards?.[who];
    const moves = game?.moves || [];
    if (!board) return null;

    return (
      <div className="grid">
        {board.map((row, r) =>
          row.map((cell, c) => {
            const shot = moves.find((m) => m.r === r && m.c === c);
            let cls = "cell";
            if (shot) cls += shot.hit ? " hit" : " miss";
            if (!isOpponent && cell === 1) cls += " ship";
            return (
              <div
                key={`${r}-${c}`}
                className={cls}
                onClick={() => {
                  if (isOpponent && status === "playing") makeMove(r, c);
                }}
              >
                {shot ? (shot.hit ? "X" : "•") : ""}
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <>
      <header>
        <h1>Battleships</h1>
        <div>Your ID: {playerId}</div>
      </header>
      <main>
        <section>
          <h2>Controls</h2>
          <button onClick={createRoom}>Start Game</button>
          <div style={{ marginTop: "1rem" }}>
            <input
              value={roomId || ""}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID or link"
              style={{ width: "70%", padding: "4px" }}
            />
            <button
              style={{ marginLeft: "0.5rem" }}
              onClick={() => joinRoom(roomId.replace(/.*[?&]game=/, ""))}
            >
              Join
            </button>
          </div>
          <p>Status: <strong>{status}</strong></p>
          {game?.winner && <p>Winner: {game.winner}</p>}
        </section>
        <section>
          <h2>Game</h2>
          {game ? (
            <>
              <p>Turn: <strong>{game.turn}</strong></p>
              <div style={{ display: "flex", gap: "1rem" }}>
                <div>
                  <h3>Your board</h3>
                  {renderGrid(role === "host" ? "host" : "guest", false)}
                </div>
                <div>
                  <h3>Opponent</h3>
                  {renderGrid(role === "host" ? "guest" : "host", true)}
                </div>
              </div>
            </>
          ) : (
            <p>No game yet.</p>
          )}
        </section>
      </main>
      <footer>© 2025 Battleships — Firebase Edition</footer>
    </>
  );
}
