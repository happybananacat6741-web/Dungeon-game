🎮 Dungeon Delve
A terminal-style roguelike dungeon crawler built entirely in React. No external game libraries — just pure logic, SVG, and CSS.
🖼 Preview
Code
✨ Features
🗺 Procedurally generated maps — rooms, corridors, and doors every run
🌫 Fog of war — field-of-view system, only see what's nearby
👾 5 monster types — Goblin, Orc, Skeleton, Troll, Dragon
🧠 Monster AI — enemies path toward the player
⚔️ Turn-based combat — attack by walking into enemies
🎒 Items — Health Potions, Swords, Shields, Fire Scrolls
📈 Leveling system — gain XP, level up, grow stronger
🏆 10 floors — descend deeper and survive to win
🚀 Getting Started
Option 1 — CodeSandbox (easiest)
Go to codesandbox.io
Create a new React project
Replace App.js with dungeon_game.jsx
Play instantly in the browser
Option 2 — Local
Bash
🎮 Controls
Key
Action
W / ↑
Move Up
S / ↓
Move Down
A / ←
Move Left
D / →
Move Right
Walk into enemy
Attack
Walk over item
Pick up
Walk onto >
Descend floor
🗺 Tile Legend
Symbol
Meaning
@
Player
#
Wall
.
Floor
+
Door
>
Stairs down
g
Goblin
o
Orc
s
Skeleton
T
Troll
D
Dragon
!
Health Potion
/
Weapon
[
Armor
?
Fire Scroll
🛠 Tech Stack
React (useState, useEffect, useCallback)
Pure CSS for styling
No game libraries or external dependencies
>
