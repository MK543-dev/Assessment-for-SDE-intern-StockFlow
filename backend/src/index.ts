import dotenv from 'dotenv';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const prisma = new PrismaClient();
const port = Number(process.env.PORT) || 4000;
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET is required. Copy .env.example to .env and set a secret.');

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

type AuthRequest = Request & { userId?: string; organizationId?: string };
const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, jwtSecret!) as { userId: string; organizationId: string };
    req.userId = payload.userId;
    req.organizationId = payload.organizationId;
    next();
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
};

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(64),
  description: z.string().trim().max(2000).optional().nullable(),
  quantity: z.number().int().min(0).max(2_000_000_000),
  costPrice: z.number().min(0).max(99_999_999).optional().nullable(),
  sellingPrice: z.number().min(0).max(99_999_999).optional().nullable(),
  lowStockThreshold: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
});
const safeProduct = (product: any) => ({ ...product, costPrice: product.costPrice === null ? null : Number(product.costPrice), sellingPrice: product.sellingPrice === null ? null : Number(product.sellingPrice) });

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const parsed = credentialsSchema.extend({ organizationName: z.string().trim().min(1).max(120) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check your details.' });
    const { email, password, organizationName } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash, organization: { create: { name: organizationName } }, }, include: { organization: true } });
    const token = jwt.sign({ userId: user.id, organizationId: user.organizationId }, jwtSecret!, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: user.id, email: user.email, organization: user.organization } });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check your details.' });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, include: { organization: true } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
    const token = jwt.sign({ userId: user.id, organizationId: user.organizationId }, jwtSecret!, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, email: user.email, organization: user.organization } });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', auth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { organization: true } });
    if (!user) return res.status(401).json({ message: 'Account not found.' });
    return res.json({ id: user.id, email: user.email, organization: user.organization });
  } catch (error) { next(error); }
});

app.get('/api/dashboard', auth, async (req: AuthRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const [products, organization] = await Promise.all([
      prisma.product.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' } }),
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    ]);
    const lowStock = products.filter((p) => p.quantity <= (p.lowStockThreshold ?? organization.defaultLowStockThreshold));
    return res.json({ totalProducts: products.length, totalUnits: products.reduce((sum, p) => sum + p.quantity, 0), lowStockCount: lowStock.length, lowStock: lowStock.map((p) => ({ ...safeProduct(p), effectiveThreshold: p.lowStockThreshold ?? organization.defaultLowStockThreshold })), recentProducts: products.slice(0, 5).map(safeProduct) });
  } catch (error) { next(error); }
});

app.get('/api/products', auth, async (req: AuthRequest, res, next) => {
  try {
    const query = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const [products, organization] = await Promise.all([
      prisma.product.findMany({ where: { organizationId: req.organizationId!, ...(query ? { OR: [{ name: { contains: query } }, { sku: { contains: query } }] } : {}) }, orderBy: { updatedAt: 'desc' } }),
      prisma.organization.findUniqueOrThrow({ where: { id: req.organizationId! }, select: { defaultLowStockThreshold: true } }),
    ]);
    return res.json(products.map((p) => ({ ...safeProduct(p), effectiveThreshold: p.lowStockThreshold ?? organization.defaultLowStockThreshold })));
  } catch (error) { next(error); }
});

app.post('/api/products', auth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check the product details.' });
    const product = await prisma.product.create({ data: { ...parsed.data, organizationId: req.organizationId!, sku: parsed.data.sku.toUpperCase() } });
    return res.status(201).json(safeProduct(product));
  } catch (error) { next(error); }
});

app.put('/api/products/:id', auth, async (req: AuthRequest, res, next) => {
  try {
    const productId = String(req.params.id);
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check the product details.' });
    const result = await prisma.product.updateMany({ where: { id: productId, organizationId: req.organizationId! }, data: { ...parsed.data, sku: parsed.data.sku.toUpperCase() } });
    if (!result.count) return res.status(404).json({ message: 'Product not found.' });
    const product = await prisma.product.findFirstOrThrow({ where: { id: productId, organizationId: req.organizationId! } });
    return res.json(safeProduct(product));
  } catch (error) { next(error); }
});

app.delete('/api/products/:id', auth, async (req: AuthRequest, res, next) => {
  try {
    const result = await prisma.product.deleteMany({ where: { id: String(req.params.id), organizationId: req.organizationId! } });
    if (!result.count) return res.status(404).json({ message: 'Product not found.' });
    return res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/settings', auth, async (req: AuthRequest, res, next) => {
  try {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: req.organizationId! } });
    return res.json({ name: organization.name, defaultLowStockThreshold: organization.defaultLowStockThreshold });
  } catch (error) { next(error); }
});

app.put('/api/settings', auth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(120), defaultLowStockThreshold: z.number().int().min(0).max(2_000_000_000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check the settings.' });
    const organization = await prisma.organization.update({ where: { id: req.organizationId! }, data: parsed.data });
    return res.json({ name: organization.name, defaultLowStockThreshold: organization.defaultLowStockThreshold });
  } catch (error) { next(error); }
});

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ message: 'That SKU is already in use in your organization.' });
  console.error(error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

const server = app.listen(port, () => console.log(`StockFlow API listening on http://localhost:${port}`));
const shutdown = async () => { server.close(); await prisma.$disconnect(); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
