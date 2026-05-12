import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────
const COLS = 40, ROWS = 22;
const TILE = { WALL:"#", FLOOR:".", STAIRS:">", DOOR:"+" };
const DIR  = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
               w:[0,-1], s:[0,1], a:[-1,0], d:[1,0] };

const MONSTERS = [
  { name:"Goblin",   ch:"g", hp:8,  maxHp:8,  atk:2, def:0, xp:5,  color:"#7ec850" },
  { name:"Orc",      ch:"o", hp:15, maxHp:15, atk:4, def:1, xp:12, color:"#c87e50" },
  { name:"Skeleton", ch:"s", hp:10, maxHp:10, atk:3, def:0, xp:8,  color:"#d4d4c8" },
  { name:"Troll",    ch:"T", hp:25, maxHp:25, atk:6, def:2, xp:20, color:"#50c87e" },
  { name:"Dragon",   ch:"D", hp:40, maxHp:40, atk:10,def:3, xp:50, color:"#ff6060" },
];

const ITEMS = [
  { name:"Health Potion", ch:"!", color:"#ff6688", effect:{type:"heal",   val:15} },
  { name:"Sword +1",      ch:"/", color:"#88ccff", effect:{type:"weapon", val:2 } },
  { name:"Shield +1",     ch:"[", color:"#ffcc44", effect:{type:"armor",  val:1 } },
  { name:"Scroll of Fire",ch:"?", color:"#ff9900", effect:{type:"spell",  val:20} },
];

const PALETTE = {
  bg:"#0d0d14", wall:"#2a2a3d", floor:"#1a1a26", text:"#c8c8e8",
  player:"#ffd700", stairs:"#44ffaa", door:"#cc8844", dim:"#3a3a5a",
  hp:"#ff4466", mana:"#4488ff", xp:"#ffcc22",
};

// ─────────────────────────────────────────
//  Map Generation
// ─────────────────────────────────────────
function createGrid(fill) {
  return Array.from({length:ROWS}, () => Array(COLS).fill(fill));
}

function carveRoom(map, x, y, w, h) {
  for (let row=y; row<y+h; row++)
    for (let col=x; col<x+w; col++)
      if (row>0&&row<ROWS-1&&col>0&&col<COLS-1) map[row][col]=TILE.FLOOR;
}

function carveCorridor(map, x1,y1, x2,y2) {
  let x=x1, y=y1;
  while (x!==x2) { if(y>0&&y<ROWS-1&&x>0&&x<COLS-1) map[y][x]=TILE.FLOOR; x+=x<x2?1:-1; }
  while (y!==y2) { if(y>0&&y<ROWS-1&&x>0&&x<COLS-1) map[y][x]=TILE.FLOOR; y+=y<y2?1:-1; }
}

function rand(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }

function generateLevel(floor) {
  const map = createGrid(TILE.WALL);
  const rooms = [];
  const numRooms = rand(5+floor, 10+floor);

  for (let i=0; i<numRooms*4; i++) {
    const w=rand(4,10), h=rand(3,7);
    const x=rand(1,COLS-w-2), y=rand(1,ROWS-h-2);
    const overlap = rooms.some(r =>
      x<r.x+r.w+1 && x+w>r.x-1 && y<r.y+r.h+1 && y+h>r.y-1
    );
    if (!overlap && rooms.length < numRooms) {
      carveRoom(map, x, y, w, h);
      rooms.push({x, y, w, h, cx:Math.floor(x+w/2), cy:Math.floor(y+h/2)});
    }
  }

  for (let i=1; i<rooms.length; i++)
    carveCorridor(map, rooms[i-1].cx, rooms[i-1].cy, rooms[i].cx, rooms[i].cy);

  // Add doors at corridor transitions
  for (let y=1; y<ROWS-1; y++)
    for (let x=1; x<COLS-1; x++)
      if (map[y][x]===TILE.FLOOR && Math.random()<0.03) {
        const adj = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>map[y+dy][x+dx]===TILE.FLOOR);
        if (adj.length===2) map[y][x]=TILE.DOOR;
      }

  // Place stairs in last room
  const lastRoom = rooms[rooms.length-1];
  map[lastRoom.cy][lastRoom.cx] = TILE.STAIRS;

  // Spawn monsters
  const monsters = [];
  const difficulty = 1 + Math.floor(floor/3);
  const pool = MONSTERS.slice(0, Math.min(difficulty+1, MONSTERS.length));
  rooms.slice(1).forEach(room => {
    const count = rand(0, 2+floor);
    for (let i=0; i<count; i++) {
      const base = pool[rand(0, pool.length-1)];
      const hpBonus = floor * rand(1,3);
      monsters.push({
        ...base, id: Math.random().toString(36).slice(2),
        hp: base.maxHp + hpBonus, maxHp: base.maxHp + hpBonus,
        atk: base.atk + Math.floor(floor/2),
        x: rand(room.x+1, room.x+room.w-2),
        y: rand(room.y+1, room.y+room.h-2),
      });
    }
  });

  // Spawn items
  const items = [];
  rooms.slice(1).forEach((room, i) => {
    if (Math.random() < 0.5) {
      const item = ITEMS[rand(0, ITEMS.length-1)];
      items.push({
        ...item, id: Math.random().toString(36).slice(2),
        x: rand(room.x+1, room.x+room.w-2),
        y: rand(room.y+1, room.y+room.h-2),
      });
    }
  });

  const startRoom = rooms[0];
  return {
    map, rooms, monsters, items,
    playerStart: { x: startRoom.cx, y: startRoom.cy }
  };
}

// ─────────────────────────────────────────
//  FOV (simple radius)
// ─────────────────────────────────────────
function computeFov(map, px, py, radius=8) {
  const visible = createGrid(false);
  const seen    = createGrid(false);
  for (let angle=0; angle<360; angle+=1) {
    const rad = angle * Math.PI/180;
    let x=px, y=py;
    for (let r=0; r<radius; r++) {
      const ix=Math.round(x), iy=Math.round(y);
      if (ix<0||ix>=COLS||iy<0||iy>=ROWS) break;
      visible[iy][ix]=true;
      seen[iy][ix]=true;
      if (map[iy][ix]===TILE.WALL) break;
      x+=Math.cos(rad); y+=Math.sin(rad);
    }
  }
  return {visible, seen};
}

// ─────────────────────────────────────────
//  Combat
// ─────────────────────────────────────────
function calcDamage(atk, def) {
  const base = Math.max(1, atk - def + rand(-1, 2));
  return base;
}

// ─────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────
export default function Dungeon() {
  const initPlayer = () => ({
    x:0, y:0, hp:30, maxHp:30, atk:4, def:1,
    xp:0, level:1, xpToNext:20, gold:0,
    weapon:"Fists", armor:"Rags", inventory:[],
  });

  const [gameState, setGameState] = useState("start"); // start | playing | dead | win
  const [player, setPlayer]       = useState(initPlayer);
  const [level, setLevel]         = useState(null);
  const [floor, setFloor]         = useState(1);
  const [fov, setFov]             = useState(null);
  const [log, setLog]             = useState([]);
  const [turn, setTurn]           = useState(0);
  const logRef = useRef(null);

  const addLog = useCallback((msg, color="#c8c8e8") => {
    setLog(prev => [...prev.slice(-80), {msg, color, id: Math.random()}]);
  }, []);

  const startGame = useCallback(() => {
    const p = initPlayer();
    const lvl = generateLevel(1);
    p.x = lvl.playerStart.x;
    p.y = lvl.playerStart.y;
    const f = computeFov(lvl.map, p.x, p.y);
    setPlayer(p); setLevel(lvl); setFloor(1);
    setFov(f); setLog([]); setTurn(0);
    setGameState("playing");
    setTimeout(() => addLog("You descend into the dungeon. Good luck, adventurer!", "#ffd700"), 10);
  }, [addLog]);

  const descend = useCallback((p, currentFloor) => {
    const nextFloor = currentFloor + 1;
    if (nextFloor > 10) { setGameState("win"); return; }
    const lvl = generateLevel(nextFloor);
    const newP = {...p, x:lvl.playerStart.x, y:lvl.playerStart.y};
    const f = computeFov(lvl.map, newP.x, newP.y);
    setPlayer(newP); setLevel(lvl); setFloor(nextFloor); setFov(f);
    addLog(`You descend to floor ${nextFloor}...`, "#44ffaa");
  }, [addLog]);

  const handleMove = useCallback((dx, dy) => {
    if (gameState !== "playing" || !level) return;

    setLevel(prevLevel => {
      setPlayer(prevPlayer => {
        const nx = prevPlayer.x + dx, ny = prevPlayer.y + dy;
        if (nx<0||nx>=COLS||ny<0||ny>=ROWS) return prevPlayer;
        const tile = prevLevel.map[ny][nx];
        if (tile === TILE.WALL) return prevPlayer;

        // Open door
        if (tile === TILE.DOOR) {
          const newMap = prevLevel.map.map(r=>[...r]);
          newMap[ny][nx] = TILE.FLOOR;
          addLog("You open the door.", "#cc8844");
          const newLevel = {...prevLevel, map:newMap};
          setLevel(newLevel);
          const f = computeFov(newMap, prevPlayer.x, prevPlayer.y);
          setFov(f);
          return prevPlayer;
        }

        // Fight monster?
        const monster = prevLevel.monsters.find(m=>m.x===nx&&m.y===ny);
        if (monster) {
          let newPlayer = {...prevPlayer};
          let newMonsters = [...prevLevel.monsters];
          // Player attacks
          const dmg = calcDamage(newPlayer.atk, monster.def);
          const mIdx = newMonsters.findIndex(m=>m.id===monster.id);
          newMonsters[mIdx] = {...newMonsters[mIdx], hp: newMonsters[mIdx].hp - dmg};
          addLog(`You hit the ${monster.name} for ${dmg} damage.`, "#ffaa44");

          if (newMonsters[mIdx].hp <= 0) {
            addLog(`The ${monster.name} dies! +${monster.xp} XP`, "#7ec850");
            newPlayer.xp += monster.xp;
            newPlayer.gold += rand(1, monster.xp);
            // Level up?
            while (newPlayer.xp >= newPlayer.xpToNext) {
              newPlayer.xp -= newPlayer.xpToNext;
              newPlayer.level += 1;
              newPlayer.xpToNext = Math.floor(newPlayer.xpToNext * 1.5);
              newPlayer.maxHp += 8; newPlayer.hp += 8;
              newPlayer.atk += 1;
              addLog(`LEVEL UP! You are now level ${newPlayer.level}!`, "#ffd700");
            }
            newMonsters.splice(mIdx, 1);
          } else {
            // Monster counter-attacks
            const mDmg = calcDamage(newMonsters[mIdx].atk, newPlayer.def);
            newPlayer.hp -= mDmg;
            addLog(`The ${monster.name} hits you for ${mDmg} damage.`, "#ff6688");
            if (newPlayer.hp <= 0) {
              setGameState("dead");
              addLog("You have died... Game over.", "#ff0000");
            }
          }
          setLevel({...prevLevel, monsters:newMonsters});
          setTurn(t => t+1);
          return newPlayer;
        }

        // Pick up item?
        let newItems = [...prevLevel.items];
        let newPlayer = {...prevPlayer, x:nx, y:ny};
        const itemIdx = newItems.findIndex(i=>i.x===nx&&i.y===ny);
        if (itemIdx >= 0) {
          const item = newItems[itemIdx];
          newItems.splice(itemIdx, 1);
          if (item.effect.type === "heal") {
            newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp + item.effect.val);
            addLog(`You drink the ${item.name}. +${item.effect.val} HP`, "#ff6688");
          } else if (item.effect.type === "weapon") {
            newPlayer.atk += item.effect.val;
            newPlayer.weapon = item.name;
            addLog(`You equip the ${item.name}. +${item.effect.val} ATK`, "#88ccff");
          } else if (item.effect.type === "armor") {
            newPlayer.def += item.effect.val;
            newPlayer.armor = item.name;
            addLog(`You equip the ${item.name}. +${item.effect.val} DEF`, "#ffcc44");
          } else if (item.effect.type === "spell") {
            // Fire scroll: damage nearest monster
            const near = prevLevel.monsters.slice().sort((a,b)=>
              Math.hypot(a.x-nx,a.y-ny)-Math.hypot(b.x-nx,b.y-ny))[0];
            if (near) {
              const spellDmg = item.effect.val;
              const mIdx2 = prevLevel.monsters.findIndex(m=>m.id===near.id);
              const nm = [...prevLevel.monsters];
              nm[mIdx2] = {...nm[mIdx2], hp: nm[mIdx2].hp - spellDmg};
              addLog(`FIRE! The ${near.name} takes ${spellDmg} damage!`, "#ff9900");
              if (nm[mIdx2].hp <= 0) {
                addLog(`The ${near.name} is incinerated! +${near.xp} XP`, "#ff6600");
                newPlayer.xp += near.xp;
                nm.splice(mIdx2, 1);
              }
              setLevel(l => ({...l, monsters:nm, items:newItems}));
            }
          }
          setLevel(l => ({...l, items:newItems}));
        }

        // Stairs?
        if (tile === TILE.STAIRS) {
          addLog("You find the stairs downward...", "#44ffaa");
          setTimeout(() => descend(newPlayer, floor), 200);
        }

        const f = computeFov(prevLevel.map, nx, ny);
        setFov(f);
        setTurn(t => t+1);
        return newPlayer;
      });
      return prevLevel;
    });
  }, [gameState, level, floor, addLog, descend]);

  // Monster AI: move toward player each turn
  useEffect(() => {
    if (gameState !== "playing" || !level) return;
    setLevel(prev => {
      if (!prev) return prev;
      const newMonsters = prev.monsters.map(m => {
        if (!player) return m;
        const dist = Math.abs(m.x-player.x)+Math.abs(m.y-player.y);
        if (dist > 10) return m;
        const dx = Math.sign(player.x - m.x), dy = Math.sign(player.y - m.y);
        const attempts = [[dx,0],[0,dy],[dx,dy],[-dx,0],[0,-dy]];
        for (const [ax,ay] of attempts) {
          const nx=m.x+ax, ny=m.y+ay;
          if (nx<0||nx>=COLS||ny<0||ny>=ROWS) continue;
          if (prev.map[ny][nx]===TILE.WALL) continue;
          if (nx===player.x&&ny===player.y) continue;
          if (prev.monsters.some(o=>o.id!==m.id&&o.x===nx&&o.y===ny)) continue;
          return {...m, x:nx, y:ny};
        }
        return m;
      });
      return {...prev, monsters:newMonsters};
    });
  }, [turn]);

  useEffect(() => {
    const handler = (e) => {
      if (DIR[e.key]) { e.preventDefault(); const [dx,dy]=DIR[e.key]; handleMove(dx,dy); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleMove]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // ── Render ──────────────────────────────
  const cellSize = 16;

  const renderMap = () => {
    if (!level || !fov) return null;
    const cells = [];
    for (let y=0; y<ROWS; y++) {
      for (let x=0; x<COLS; x++) {
        const vis  = fov.visible[y][x];
        const seen = fov.seen[y][x];
        if (!seen) continue;
        const tile = level.map[y][x];
        let ch="", color="";
        if (tile===TILE.WALL)   { ch="▓"; color=vis?PALETTE.wall:PALETTE.dim; }
        else if (tile===TILE.FLOOR) { ch="·"; color=vis?"#252535":PALETTE.dim; }
        else if (tile===TILE.STAIRS){ ch=">"; color=PALETTE.stairs; }
        else if (tile===TILE.DOOR)  { ch="+"; color=PALETTE.door; }

        cells.push(
          <span key={`${x},${y}`} style={{
            position:"absolute", left:x*cellSize, top:y*cellSize,
            width:cellSize, height:cellSize, display:"flex",
            alignItems:"center", justifyContent:"center",
            fontSize:12, fontFamily:"monospace",
            color, userSelect:"none",
          }}>{ch}</span>
        );
      }
    }

    // Items
    if (fov) level.items.forEach(item => {
      if (!fov.visible[item.y]?.[item.x]) return;
      cells.push(<span key={`item-${item.id}`} style={{
        position:"absolute", left:item.x*cellSize, top:item.y*cellSize,
        width:cellSize, height:cellSize, display:"flex",
        alignItems:"center", justifyContent:"center",
        fontSize:13, fontFamily:"monospace", color:item.color,
        zIndex:2, filter:"drop-shadow(0 0 4px currentColor)",
      }}>{item.ch}</span>);
    });

    // Monsters
    level.monsters.forEach(m => {
      if (!fov.visible[m.y]?.[m.x]) return;
      const hpPct = m.hp/m.maxHp;
      cells.push(<span key={`m-${m.id}`} style={{
        position:"absolute", left:m.x*cellSize, top:m.y*cellSize,
        width:cellSize, height:cellSize, display:"flex",
        alignItems:"center", justifyContent:"center",
        fontSize:13, fontFamily:"monospace", color:m.color,
        zIndex:3, filter:`drop-shadow(0 0 4px ${m.color})`,
      }}>{m.ch}</span>);
    });

    // Player
    cells.push(<span key="player" style={{
      position:"absolute", left:player.x*cellSize, top:player.y*cellSize,
      width:cellSize, height:cellSize, display:"flex",
      alignItems:"center", justifyContent:"center",
      fontSize:13, fontFamily:"monospace", color:PALETTE.player,
      zIndex:10, filter:"drop-shadow(0 0 6px #ffd700)",
    }}>@</span>);

    return cells;
  };

  const hpPct = player ? player.hp/player.maxHp : 1;
  const xpPct = player ? player.xp/player.xpToNext : 0;

  if (gameState === "start" || gameState === "dead" || gameState === "win") {
    return (
      <div style={{
        background:PALETTE.bg, minHeight:"100vh", display:"flex",
        alignItems:"center", justifyContent:"center", fontFamily:"monospace",
        color:PALETTE.text,
      }}>
        <div style={{textAlign:"center", maxWidth:480}}>
          {gameState==="start" && <>
            <div style={{fontSize:48, marginBottom:8}}>⚔️</div>
            <h1 style={{color:"#ffd700", fontSize:28, marginBottom:4}}>DUNGEON DELVE</h1>
            <p style={{color:"#8888aa", marginBottom:4}}>A Roguelike Adventure</p>
            <div style={{background:"#12121e", border:"1px solid #2a2a3d", borderRadius:8,
                         padding:"16px 20px", textAlign:"left", marginBottom:20, fontSize:13}}>
              <div style={{color:"#ffd700", marginBottom:8}}>CONTROLS</div>
              <div>WASD / Arrow Keys — Move / Attack</div>
              <div style={{color:"#888", marginTop:4}}>Walk into enemies to fight them</div>
              <div style={{color:"#888"}}>Walk over items to pick them up</div>
              <div style={{color:"#44ffaa", marginTop:4}}>{">"} — Descend to next floor</div>
              <div style={{color:"#888", marginTop:4}}>Reach floor 10 to win!</div>
            </div>
          </>}
          {gameState==="dead" && <>
            <div style={{fontSize:48, marginBottom:8}}>💀</div>
            <h1 style={{color:"#ff4466", fontSize:28, marginBottom:4}}>YOU DIED</h1>
            <p style={{color:"#8888aa"}}>Floor {floor} • Turn {turn} • Level {player?.level}</p>
          </>}
          {gameState==="win" && <>
            <div style={{fontSize:48, marginBottom:8}}>🏆</div>
            <h1 style={{color:"#ffd700", fontSize:28, marginBottom:4}}>VICTORY!</h1>
            <p style={{color:"#44ffaa"}}>You conquered all 10 floors!</p>
            <p style={{color:"#8888aa"}}>Level {player?.level} • Gold: {player?.gold}</p>
          </>}
          <button onClick={startGame} style={{
            background:"#ffd700", color:"#0d0d14", border:"none", padding:"12px 32px",
            fontSize:16, fontFamily:"monospace", fontWeight:"bold", cursor:"pointer",
            borderRadius:6, marginTop:8, letterSpacing:2,
          }}>
            {gameState==="start" ? "BEGIN ADVENTURE" : "PLAY AGAIN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background:PALETTE.bg, minHeight:"100vh", fontFamily:"monospace",
      color:PALETTE.text, display:"flex", flexDirection:"column",
      alignItems:"center", padding:16, userSelect:"none",
    }}>
      {/* Header */}
      <div style={{display:"flex", gap:24, marginBottom:12, fontSize:13, color:"#aaaacc"}}>
        <span>⚔ Floor <b style={{color:"#ffd700"}}>{floor}/10</b></span>
        <span>⏱ Turn <b style={{color:"#aaaacc"}}>{turn}</b></span>
        <span>🪙 Gold <b style={{color:"#ffcc44"}}>{player.gold}</b></span>
        <span>⭐ Level <b style={{color:"#44ffaa"}}>{player.level}</b></span>
      </div>

      {/* Game Area */}
      <div style={{display:"flex", gap:16, alignItems:"flex-start"}}>

        {/* Map */}
        <div style={{
          position:"relative", width:COLS*cellSize, height:ROWS*cellSize,
          background:"#080810", border:"1px solid #1e1e30", borderRadius:4,
          overflow:"hidden", flexShrink:0,
        }}>
          {renderMap()}
        </div>

        {/* Sidebar */}
        <div style={{width:180, fontSize:12}}>
          {/* HP */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{color:"#ff6688"}}>❤ HP</span>
              <span>{player.hp}/{player.maxHp}</span>
            </div>
            <div style={{background:"#1a1a26", height:8, borderRadius:4, overflow:"hidden"}}>
              <div style={{width:`${hpPct*100}%`, height:"100%",
                background: hpPct>0.5?"#ff4466":hpPct>0.25?"#ff8800":"#ff0000",
                transition:"width 0.2s"}}/>
            </div>
          </div>
          {/* XP */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{color:PALETTE.xp}}>✦ XP</span>
              <span>{player.xp}/{player.xpToNext}</span>
            </div>
            <div style={{background:"#1a1a26", height:8, borderRadius:4, overflow:"hidden"}}>
              <div style={{width:`${xpPct*100}%`, height:"100%",
                background:PALETTE.xp, transition:"width 0.2s"}}/>
            </div>
          </div>
          {/* Stats */}
          <div style={{background:"#0f0f1e", border:"1px solid #1e1e30",
                       borderRadius:6, padding:"10px 12px", marginBottom:10}}>
            <div style={{color:"#ffd700", marginBottom:6}}>STATS</div>
            <div>⚔ ATK  <b style={{color:"#ff9966"}}>{player.atk}</b></div>
            <div>🛡 DEF  <b style={{color:"#6699ff"}}>{player.def}</b></div>
            <div style={{marginTop:6, color:"#888", fontSize:11}}>{player.weapon}</div>
            <div style={{color:"#888", fontSize:11}}>{player.armor}</div>
          </div>
          {/* Legend */}
          <div style={{background:"#0f0f1e", border:"1px solid #1e1e30",
                       borderRadius:6, padding:"10px 12px", fontSize:11}}>
            <div style={{color:"#ffd700", marginBottom:6}}>LEGEND</div>
            {[["@","You",PALETTE.player],["g","Goblin","#7ec850"],["o","Orc","#c87e50"],
              ["s","Skeleton","#d4d4c8"],["T","Troll","#50c87e"],["D","Dragon","#ff6060"],
              ["!","Potion","#ff6688"],["/","Weapon","#88ccff"],
              ["[","Armor","#ffcc44"],["?","Scroll","#ff9900"],
              [">","Stairs","#44ffaa"]].map(([ch,label,col])=>(
              <div key={ch} style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                <span style={{color:col,width:14,textAlign:"center"}}>{ch}</span>
                <span style={{color:"#8888aa"}}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Log */}
      <div ref={logRef} style={{
        marginTop:12, width:COLS*cellSize+16+180, height:100,
        overflowY:"auto", background:"#080810",
        border:"1px solid #1e1e30", borderRadius:4,
        padding:"8px 12px", fontSize:12,
      }}>
        {log.map(l => (
          <div key={l.id} style={{color:l.color, lineHeight:"1.6"}}>{l.msg}</div>
        ))}
      </div>

      <div style={{marginTop:8, fontSize:11, color:"#333344"}}>
        WASD / Arrow Keys to move • Walk into enemies to attack • Walk over items to pick up
      </div>
    </div>
  );
}
