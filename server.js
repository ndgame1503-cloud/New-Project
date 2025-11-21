/**
Simple Express backend with:
- JSON file "db.json" as storage (no DB required)
- Email OTP via nodemailer (requires SMTP env config)
- JWT tokens for auth
- Posts, profanity filter, image upload (to /uploads), comments via Socket.IO
- Game leaderboard and daily questions
Note: For production, replace JSON storage with real DB.
*/
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Filter = require('bad-words');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: "*" }});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) { cb(null, Date.now() + "-" + file.originalname); }
});
const upload = multer({ storage: storage, limits: { fileSize: 5*1024*1024 } });

const filter = new Filter();

// simple JSON DB helpers
function readDB(){
  if(!fs.existsSync(DATA_FILE)) {
    const init = { users:[], otps:[], posts:[], comments:[], game_scores:[], question_answers:[], question_leaderboard:[], questions:[] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeDB(db){ fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// load sample 100 questions if empty
function ensureQuestions(){
  const db = readDB();
  if(!db.questions || db.questions.length < 100){
    // small set of questions (100) - simple ones; answers stored for checking
    const qs = [
      {"q":"Thủ đô của Nhật Bản là thành phố nào?","a":"tokyo"},
      {"q":"Tên của loài chim không biết bay, sống ở New Zealand, là gì?","a":"kiwi"},
      {"q":"2 + 2 × 2 = ?","a":"6"},
      {"q":"Quốc gia có diện tích lớn nhất thế giới?","a":"russia"},
      {"q":"Ai viết “Truyện Kiều”?","a":"nguyễn du"},
      {"q":"Màu nào nằm giữa cầu vồng?","a":"green"},
      {"q":"Tên hành tinh được gọi là 'Hành tinh Đỏ'?","a":"mars"},
      {"q":"Từ tiếng Anh 'apple' dịch ra tiếng Việt là?","a":"táo"},
      {"q":"Tháng nào có 28 ngày?","a":"february"},
      {"q":"Tên nhạc cụ có phím, tiếng đàn vang là?","a":"piano"},
      {"q":"Hình có 4 cạnh bằng gọi là gì?","a":"square"},
      {"q":"12 giờ sáng gọi là? (AM/PM trả lời)","a":"am"},
      {"q":"Nước nào nổi tiếng với tháp Eiffel?","a":"france"},
      {"q":"Cái gì lên nhưng không bao giờ xuống?","a":"age"},
      {"q":"Biểu tượng '@' gọi là gì trong tiếng Việt?","a":"at"},
      {"q":"Gì màu vàng, dài, ăn được, thường bóc vỏ?","a":"banana"},
      {"q":"Tên vị lãnh tụ nước Mỹ nổi tiếng: Abraham ___?","a":"lincoln"},
      {"q":"Con vật có vòi dài là?","a":"elephant"},
      {"q":"Dấu '!' gọi là gì?","a":"exclamation"},
      {"q":"Ai là tác giả 'Chiếc thuyền ngoài xa'?","a":"nguyễn minh châu"},
      {"q":"Hình tròn có bán kính r, chu vi bằng bao nhiêu?","a":"2πr"},
      {"q":"H2O là công thức của chất gì?","a":"water"},
      {"q":"Biển lớn nhất Trái Đất là gì?","a":"pacific"},
      {"q":"Tên mẹ của người con trai là 'con gái của bố' gọi là?","a":"sister"},
      {"q":"Game 'Super Mario' do hãng nào phát triển?","a":"nintendo"},
      {"q":"Ai vẽ bức 'Mona Lisa'?","a":"leonardo da vinci"},
      {"q":"Quốc gia có hình dáng chiếc ủng nằm ở châu Âu?","a":"italy"},
      {"q":"Tên chiếc xe hơi điện của Tesla là?","a":"model 3"},
      {"q":"Trong tiếng Anh 'thank you' tương đương với?","a":"thank you"},
      {"q":"Thành phố nào gọi là 'Kinh đô ánh sáng'?","a":"paris"},
      {"q":"Lịch nào có 7 ngày?","a":"gregorian"},
      {"q":"WWW nghĩa là?","a":"world wide web"},
      {"q":"Trong bộ bài, quân nào lớn nhất?","a":"ace"},
      {"q":"Từ ghép 'máy + bay' = ?","a":"máy bay"},
      {"q":"Quốc gia có biểu tượng cây lá phong?","a":"canada"},
      {"q":"Số nguyên tố nhỏ nhất > 1 là?","a":"2"},
      {"q":"Tên loài hoa quốc gia của Nhật Bản?","a":"cherry blossom"},
      {"q":"HTTP viết tắt của?","a":"hypertext transfer protocol"},
      {"q":"Tổng 50 + 25 = ?","a":"75"},
      {"q":"Cái gì bạn càng lấy ra càng để lại nhiều?","a":"hole"},
      {"q":"Quốc gia có nhiều đảo nhất thế giới?","a":"indonesia"},
      {"q":"Loại ngôn ngữ lập trình phổ biến cho web frontend?","a":"javascript"},
      {"q":"Bóng đá có bao nhiêu người trên sân cho mỗi đội?","a":"11"},
      {"q":"Nước nào có thủ đô là Canberra?","a":"australia"},
      {"q":"Ai là tác giả 'Dế Mèn phiêu lưu ký'?","a":"tô hoài"},
      {"q":"Con người có bao nhiêu cặp nhiễm sắc thể?","a":"23"},
      {"q":"1000 m = ? km","a":"1"},
      {"q":"Trong toán, PI xấp xỉ bằng?","a":"3.14"},
      {"q":"Biểu tượng của Apple là gì?","a":"apple"},
      {"q":"Quốc gia có Tháp Pisa nghiêng?","a":"italy"},
      {"q":"CPU là viết tắt của?","a":"central processing unit"},
      {"q":"Ai đặt chân lên Mặt Trăng đầu tiên?","a":"neil armstrong"},
      {"q":"Tên sông dài nhất châu Á?","a":"yangtze"},
      {"q":"Từ tiếng Việt 'bánh mì' trong tiếng Anh là?","a":"bread"},
      {"q":"Sắp xếp 3,1,4 để thành số lớn nhất","a":"431"},
      {"q":"Viết tắt của 'Artificial Intelligence' là?","a":"ai"},
      {"q":"Năm kết thúc Thế chiến II là?","a":"1945"},
      {"q":"Tên hoa đặc trưng Tết Việt Nam?","a":"hoa mai"},
      {"q":"Thứ tự các hành tinh từ gần Mặt Trời nhất?","a":"mercury, venus, earth"},
      {"q":"Kể tên một loại quả có múi?","a":"orange"},
      {"q":"Tên nhà văn dùng bút danh 'Nam Cao'?","a":"trung viên"},
      {"q":"Tên hệ điều hành mã nguồn mở phổ biến?","a":"linux"},
      {"q":"Số Fibonacci tiếp theo sau 8 là?","a":"13"},
      {"q":"Thủ đô nước Hàn Quốc là?","a":"seoul"},
      {"q":"Một màu trung tính thường dùng trong thiết kế tối?","a":"gray"},
      {"q":"Con vật biểu tượng của nước Anh là?","a":"lion"},
      {"q":"Tên môn thể thao có lưới trên sân và quả shuttlecock?","a":"badminton"},
      {"q":"JSON là định dạng dùng để truyền gì?","a":"data"},
      {"q":"Biển nào tách châu Âu và châu Á?","a":"black sea"},
      {"q":"Tính: 15% của 200 = ?","a":"30"},
      {"q":"Vật thể quanh Trái Đất phản chiếu ánh sáng ban đêm?","a":"moon"},
      {"q":"Kể tên một loại nhạc cụ dây.","a":"guitar"},
      {"q":"Tên sách thiếu nhi nổi tiếng của Roald Dahl?","a":"charlie and the chocolate factory"},
      {"q":"Thành phố nổi tiếng với kênh đào, gondola?","a":"venice"},
      {"q":"Ai phát minh ra bóng đèn (tên thường nhắc đến)?","a":"thomas edison"},
      {"q":"Trong toán, 0 chia cho 5 = ?","a":"0"},
      {"q":"Tên một loài động vật ăn cỏ sống trên đồng cỏ?","a":"cow"},
      {"q":"Chữ cái đầu của 'Vietnam' là?","a":"v"},
      {"q":"Tên một phim hoạt hình nổi tiếng của Pixar?","a":"toy story"},
      {"q":"Số mặt của hình lập phương là bao nhiêu?","a":"6"},
      {"q":"Tên một loại hạt dùng làm sữa thực vật?","a":"almond"},
      {"q":"Tượng Nữ Thần Tự Do nằm ở đâu?","a":"new york"},
      {"q":"Ai là người sáng lập Microsoft?","a":"bill gates"},
      {"q":"Tên một loại ngũ cốc?","a":"oats"},
      {"q":"Một từ đồng nghĩa với 'nhanh'?","a":"fast"},
      {"q":"Phương tiện giao thông công cộng chạy trên ray?","a":"train"},
      {"q":"Số nguyên lớn tiếp theo sau 99?","a":"100"},
      {"q":"Kỹ năng mềm quan trọng khi làm việc nhóm?","a":"communication"},
      {"q":"Tên một công cụ quản lý mã nguồn (VCS)?","a":"git"},
      {"q":"Viết 1 câu chúc ngắn cho cộng đồng.","a":"Chúc cộng đồng luôn vui vẻ và sáng tạo!"}
    ];
    db.questions = qs;
    writeDB(db);
  }
}
ensureQuestions();

// rate limit
const limiter = rateLimit({ windowMs: 60*1000, max: 60 });
app.use(limiter);

// Utility functions
function normalize(s){ if(!s) return ''; return s.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,""); }
function findUserByEmail(email){ const db = readDB(); return db.users.find(u=>u.email===email); }

// OTP: request and verify
app.post('/api/auth/request-otp', async (req,res)=> {
  const { email } = req.body;
  if(!email) return res.status(400).json({error:'email required'});
  const db = readDB();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  db.otps.push({ email, otp, created: Date.now() });
  writeDB(db);
  // send via SMTP if configured
  if(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS){
    try{
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: process.env.SMTP_PORT||587, secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({ from: process.env.SMTP_FROM||process.env.SMTP_USER, to: email, subject: "Your OTP", text: "Your OTP: "+otp });
    }catch(e){
      console.error("Mail error", e);
    }
  } else {
    console.log("OTP for",email, otp);
  }
  return res.json({ ok: true, message: 'OTP sent (check server log or email)' });
});

app.post('/api/auth/verify-otp', (req,res)=>{
  const { email, otp, name } = req.body;
  if(!email || !otp) return res.status(400).json({error:'email and otp required'});
  const db = readDB();
  const record = db.otps.find(o=>o.email===email && o.otp===otp);
  if(!record) return res.status(400).json({error:'invalid otp'});
  // create user if not exists
  let user = db.users.find(u=>u.email===email);
  if(!user){
    user = { id: uuidv4(), email, name: name||email.split('@')[0], created: Date.now(), avatar:null };
    db.users.push(user);
  }
  // remove otps for this email
  db.otps = db.otps.filter(o=>o.email!==email);
  // issue token
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET||'devsecret', { expiresIn: '30d' });
  writeDB(db);
  return res.json({ ok:true, token, user });
});

// middleware
function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'no token'});
  const parts = auth.split(' ');
  if(parts.length!==2) return res.status(401).json({error:'invalid token'});
  const token = parts[1];
  try{
    const data = jwt.verify(token, process.env.JWT_SECRET||'devsecret');
    req.user = data;
    next();
  }catch(e){ return res.status(401).json({error:'invalid token'}); }
}

// posts
app.post('/api/posts', authMiddleware, upload.array('images',3), (req,res)=>{
  const db = readDB();
  const content = req.body.content || '';
  const clean = filter.clean(content);
  const images = (req.files||[]).map(f=> '/uploads/'+path.basename(f.path));
  const post = { id: uuidv4(), userId: req.user.id, content: clean, images, created: Date.now() };
  db.posts.push(post);
  writeDB(db);
  return res.json({ ok:true, post });
});
app.get('/api/posts', (req,res)=>{
  const db = readDB();
  const posts = db.posts.slice(-100).reverse();
  return res.json(posts);
});

// comments stored and broadcast via socket.io
io.on('connection', socket=>{
  console.log('socket connected', socket.id);
  socket.on('join', room => { socket.join(room); });
  socket.on('message', data=>{
    // data: { postId, userName, text }
    const db = readDB();
    const clean = filter.clean(data.text);
    const c = { id: uuidv4(), postId: data.postId, userName: data.userName||'Guest', text: clean, created: Date.now() };
    db.comments.push(c);
    writeDB(db);
    io.to('post_'+data.postId).emit('message', c);
  });
});

// game leaderboard endpoints
app.post('/api/game/submit', (req,res)=>{
  const { name, score, game } = req.body;
  if(typeof score === 'undefined') return res.status(400).json({error:'score required'});
  const db = readDB();
  db.game_scores.push({ id: uuidv4(), name: name||'Player', score: Number(score), t: Date.now(), game: game||'number' });
  // sort and keep top 200
  db.game_scores.sort((a,b)=>b.score - a.score || a.t - b.t);
  db.game_scores = db.game_scores.slice(0,200);
  writeDB(db);
  io.emit('leaderboard:update');
  return res.json({ ok:true });
});
app.get('/api/game/leaderboard', (req,res)=>{
  const db = readDB();
  const game = req.query.game || null;
  let list = db.game_scores || [];
  if(game){ list = list.filter(it=> (it.game||'number') === String(game)); }
  const top = list.slice(0,20);
  res.json(top);
});

// daily questions
app.get('/api/questions/today', (req,res)=>{
  const db = readDB();
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(),0,0)) / (1000*60*60*24));
  const idx = dayOfYear % db.questions.length;
  const q = db.questions[idx];
  res.json({ dayIndex: idx, question: q.q });
});

app.post('/api/questions/answer', (req,res)=>{
  const { dayIndex, answer } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if(typeof dayIndex === 'undefined' || typeof answer === 'undefined') return res.status(400).json({error:'dayIndex and answer required'});
  const db = readDB();
  // prevent multiple answers from same IP for the same day
  const existing = db.question_answers.find(a=>a.dayIndex===dayIndex && a.ip===ip);
  if(existing) return res.status(400).json({error:'already answered from this IP today'});
  const q = db.questions[dayIndex];
  const correct = normalize(answer) === normalize(q.a);
  const rec = { id: uuidv4(), dayIndex, answer, ip, correct, t: Date.now() };
  db.question_answers.push(rec);
  if(correct){
    db.question_leaderboard.push({ id: uuidv4(), name: req.body.name||'Player', dayIndex, t: Date.now(), ip });
  }
  writeDB(db);
  return res.json({ ok:true, correct });
});

// simple profile update
app.post('/api/profile/avatar', authMiddleware, upload.single('avatar'), (req,res)=>{
  const db = readDB();
  const user = db.users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'user not found'});
  user.avatar = '/uploads/' + path.basename(req.file.path);
  writeDB(db);
  res.json({ ok:true, avatar: user.avatar });
});

// utility: get current user info
app.get('/api/me', authMiddleware, (req,res)=>{
  const db = readDB();
  const user = db.users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'not found'});
  res.json(user);
});

app.get('/api/health', (req,res)=> res.json({ok:true, time:Date.now()}));

// start server
server.listen(PORT, ()=> {
  console.log("Server running on port", PORT);
});
