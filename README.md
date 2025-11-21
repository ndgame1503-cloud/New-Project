# Fullstack Demo Site (Static + Express Backend)

This package includes:
- `server.js` - Express backend (auth via email OTP, posts, comments via Socket.IO, game leaderboard, daily questions)
- `public/` - static frontend (index.html, improved game)
- `uploads/` - uploaded files
- `db.json` - JSON storage file (auto-created)
- Uses local JSON file as a lightweight database (not for production)

## Requirements
- Node.js 18+ and npm
- (Optional) SMTP credentials if you want OTP emails to be sent

## Setup & Run

1. Unzip the package.
2. In the project folder, install dependencies:
```bash
npm install
```
3. Create environment variables (optional) — you can set them in your shell:
```bash
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=your_smtp_user
export SMTP_PASS=your_smtp_pass
export SMTP_FROM="noreply@example.com"
export JWT_SECRET="a-strong-secret"
```
(Windows PowerShell: use `$env:SMTP_HOST="..."`)

If you don't set SMTP, OTP codes will be printed to server console (useful for testing).

4. Start server:
```bash
npm start
```
5. Open browser to `http://localhost:3000`

## Notes / Features
- Auth: request OTP via POST `/api/auth/request-otp` with `{email}`; then verify with `/api/auth/verify-otp` with `{email, otp, name}` to receive a JWT token.
- Posts: authenticated users can `POST /api/posts` (multipart form with `content` and optional `images[]`) and `GET /api/posts`.
- Comments: realtime via Socket.IO; connect and `join` room `post_<postId>`, emit `message` events `{postId, userName, text}`.
- Game: `public/games/Game006.html` improved to send score via `window.parent.postMessage({type:'score',score:...}, '*')`. Parent page listens and can auto-submit.
- Daily questions: `GET /api/questions/today` and `POST /api/questions/answer` with `{dayIndex, answer, name}`; server limits one answer per IP per day.
- Leaderboard: `GET /api/game/leaderboard` and `POST /api/game/submit` with `{name,score}`.

## Security & Production
This demo uses a JSON file as storage and is intended for local testing and small demos only. For production use, migrate to a database (Postgres, Supabase, etc.), secure JWT secrets, and configure SMTP securely.

