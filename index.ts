import "dotenv/config";
import express from 'express';
import { PrismaClient, User } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from 'pg';
import { createHash, randomBytes } from "crypto";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.POSTGRES_PRISMA_URL!,
});

const adapter = new PrismaPg(pool);

const app = express();
const prisma = new PrismaClient({adapter});
const PORT = 3001;
const SECRET_KEY = 'super-secret-key';

app.use(express.json());
app.use(express.static('public'));

// トークンを確認する関所（ミドルウェア）
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'トークンがありません' });

  jwt.verify(token, SECRET_KEY, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'トークンが無効です' });
    req.user = user; // トークンから取り出したユーザー情報（idなど）をリクエストにセット
    next();
  });
};

// ==========================================
// スコアAPI
// ==========================================
// スコア一覧取得（認証必須・ユーザー情報も一緒に取得）
app.get('/scores', async (req, res) => {
  try {
    const scores = await prisma.score.findMany({
      orderBy: { attempts: 'asc' },
      take: 5,
      // ★紐付いているUser情報（名前とメアド）も一緒に取得する！
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });
    res.json(scores);
  } catch (error) {
    res.status(500).json({ error: 'エラーが発生しました' });
  }
});

// スコア登録（認証必須・ログイン中のユーザーIDを紐付ける）
app.post('/scores', authenticateToken, async (req: any, res: any) => {
  const { attempts } = req.body;
  const userId = req.user.userId; // ★関所を通ったトークンの中にあるユーザーID
  
  try {
    const newScore = await prisma.score.create({
      data: { attempts: attempts, userId: userId }, // スコアとユーザーIDをセットで保存
    
    include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });
    res.status(201).json(newScore);
  } catch (error) {
    res.status(400).json({ error: '作成に失敗しました' });
  }
});

// ==========================================
// ログイン・登録API（変更なし）
// ==========================================
app.post('/users', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ error: '作成に失敗しました' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email: email } });
    if (!user) return res.status(401).json({ error: 'エラー' });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ error: 'エラー' });

    const token = jwt.sign({ userId: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });
    res.status(200).json({ message: 'ログイン成功！', token: token });
  } catch (error) {
    res.status(500).json({ error: 'サーバーエラー' });
  }
})

app.listen(Number(PORT),'0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
export default app;
