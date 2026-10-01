const express=require("express"), path=require("path"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), Database=require("better-sqlite3");
const app=express(), PORT=process.env.PORT||3000, SECRET=process.env.JWT_SECRET||"CHANGE_ME_IN_PRODUCTION";
const db=new Database(process.env.DB_PATH||path.join(__dirname,"edt.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS schools(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL,hours INTEGER NOT NULL DEFAULT 2);
CREATE TABLE IF NOT EXISTS schedules(id INTEGER PRIMARY KEY AUTOINCREMENT,school_id INTEGER NOT NULL,name TEXT NOT NULL,days INTEGER NOT NULL,periods INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
app.use(express.json({limit:"2mb"})); app.use(express.static(path.join(__dirname,"../public")));
function auth(req,res,next){try{const h=req.headers.authorization||"",t=h.startsWith("Bearer ")?h.slice(7):"";req.user=jwt.verify(t,SECRET);next()}catch(e){res.status(401).json({error:"Non authentifié"})}}
function schoolId(req){return req.user.schoolId}
app.post("/api/register",(req,res)=>{
 const {name,email,password}=req.body||{};
 if(!name||!email||!password||password.length<6)return res.status(400).json({error:"Nom, email et mot de passe (6 caractères minimum) requis"});
 try{
  const hash=bcrypt.hashSync(password,10), info=db.prepare("INSERT INTO schools(name,email,password_hash) VALUES(?,?,?)").run(name.trim(),email.trim().toLowerCase(),hash);
  const token=jwt.sign({schoolId:info.lastInsertRowid,email:email.toLowerCase()},SECRET,{expiresIn:"7d"});
  res.json({token,school:{id:info.lastInsertRowid,name,email:email.toLowerCase()}});
 }catch(e){res.status(400).json({error:"Cet email est déjà utilisé"})}
});
app.post("/api/login",(req,res)=>{
 const {email,password}=req.body||{},s=db.prepare("SELECT * FROM schools WHERE email=?").get((email||"").trim().toLowerCase());
 if(!s||!bcrypt.compareSync(password||"",s.password_hash))return res.status(401).json({error:"Email ou mot de passe incorrect"});
 res.json({token:jwt.sign({schoolId:s.id,email:s.email},SECRET,{expiresIn:"7d"}),school:{id:s.id,name:s.name,email:s.email}});
});
app.get("/api/me",auth,(req,res)=>{const s=db.prepare("SELECT id,name,email FROM schools WHERE id=?").get(schoolId(req));res.json({school:s})});
const tables={classes:["classes","name"],rooms:["rooms","name"],teachers:["teachers","name"],subjects:["subjects","name"]};
app.get("/api/:type",auth,(req,res)=>{const t=tables[req.params.type];if(!t)return res.sendStatus(404);res.json(db.prepare(`SELECT * FROM ${t[0]} WHERE school_id=? ORDER BY id`).all(schoolId(req)))});
app.post("/api/:type",auth,(req,res)=>{
 const t=tables[req.params.type];if(!t)return res.sendStatus(404);
 const name=(req.body.name||"").trim(); if(!name)return res.status(400).json({error:"Nom requis"});
 let info;
 if(req.params.type==="subjects"){const hours=Math.max(1,parseInt(req.body.hours||2));info=db.prepare("INSERT INTO subjects(school_id,name,hours) VALUES(?,?,?)").run(schoolId(req),name,hours)}
 else info=db.prepare(`INSERT INTO ${t[0]}(school_id,name) VALUES(?,?)`).run(schoolId(req),name);
 res.json({id:info.lastInsertRowid,name,hours:req.body.hours});
});
app.delete("/api/:type/:id",auth,(req,res)=>{const t=tables[req.params.type];if(!t)return res.sendStatus(404);db.prepare(`DELETE FROM ${t[0]} WHERE id=? AND school_id=?`).run(req.params.id,schoolId(req));res.json({ok:true})});
app.post("/api/generate",auth,(req,res)=>{
 const sid=schoolId(req), days=Math.min(6,Math.max(5,Number(req.body.days||5))), periods=Math.min(10,Math.max(5,Number(req.body.periods||7)));
 const classes=db.prepare("SELECT * FROM classes WHERE school_id=?").all(sid), rooms=db.prepare("SELECT * FROM rooms WHERE school_id=?").all(sid), subjects=db.prepare("SELECT * FROM subjects WHERE school_id=?").all(sid);
 if(!classes.length||!rooms.length||!subjects.length)return res.status(400).json({error:"Ajoutez au moins une classe, une salle et une matière"});
 const data={days,periods,classes:[]};
 const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const roomBusy=Array.from({length:days},()=>Array.from({length:periods},()=>new Set()));
 for(const c of classes){
  let pool=[];subjects.forEach(s=>{for(let i=0;i<s.hours;i++)pool.push(s.name)});pool=shuffle(pool);
  const grid=Array.from({length:days},()=>Array(periods).fill(null));
  for(let d=0;d<days;d++)for(let p=0;p<periods;p++){
   if(!pool.length)break; let chosen=pool.shift();
   if(p&&grid[d][p-1]?.subject===chosen&&pool.length){const k=pool.findIndex(x=>x!==chosen);if(k>=0){pool.unshift(chosen);chosen=pool.splice(k+1,1)[0]}}
   let room=rooms.find(r=>!roomBusy[d][p].has(r.id))||rooms[(c.id+d+p)%rooms.length];
   roomBusy[d][p].add(room.id);grid[d][p]={subject:chosen,room:room.name};
  }
  data.classes.push({name:c.name,grid});
 }
 db.prepare("INSERT INTO schedules(school_id,name,days,periods,data) VALUES(?,?,?,?,?)").run(sid,"Génération "+new Date().toLocaleString("fr-FR"),days,periods,JSON.stringify(data));
 res.json(data);
});
app.get("/api/schedules",auth,(req,res)=>res.json(db.prepare("SELECT id,name,days,periods,created_at FROM schedules WHERE school_id=? ORDER BY id DESC").all(schoolId(req))));
app.get("/api/schedules/:id",auth,(req,res)=>{const s=db.prepare("SELECT * FROM schedules WHERE id=? AND school_id=?").get(req.params.id,schoolId(req));if(!s)return res.sendStatus(404);res.json({...s,data:JSON.parse(s.data)})});
app.listen(PORT,()=>console.log("EDT Scolaire lancé sur le port "+PORT));
