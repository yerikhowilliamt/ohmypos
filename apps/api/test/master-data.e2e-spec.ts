/**
 * OhMyPos — Master Data E2E Tests (PRD §5.1, ADR-005, ADR-011, ADR-013, Playbook §10).
 *
 * Auth-aware end-to-end tests verifying RBAC permissions, decimal scale formatting,
 * HPP calculation, makeable quantity, recipe replacement (Option R1), and integrity constraints.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  ProductResponse,
  ProductWithHppResponse,
  RawMaterialResponse,
  RecipeEnvelopeResponse,
} from '@ohmypos/api-contracts';
import { AppModule } from '../src/app.module';
import { PostgresTriggerExceptionFilter } from '../src/common/filters/postgres-trigger-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Master Data (RawMaterial / Product / Recipe) (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'TestPassword123!';
  const owner = { email: 'md-owner@test.local', cookies: [] as string[] };
  const admin = { email: 'md-admin@test.local', cookies: [] as string[] };
  const kasir = { email: 'md-kasir@test.local', cookies: [] as string[] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new PostgresTriggerExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await cleanup();

    const branch = await prisma.branch.create({
      data: { name: 'MD Test Branch' },
    });

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.createMany({
      data: [
        { name: 'MD Owner', email: owner.email, passwordHash, role: 'OWNER' },
        { name: 'MD Admin', email: admin.email, passwordHash, role: 'ADMIN' },
        {
          name: 'MD Kasir',
          email: kasir.email,
          passwordHash,
          role: 'KASIR',
          branchId: branch.id,
        },
      ],
    });

    owner.cookies = await login(owner.email);
    admin.cookies = await login(admin.email);
    kasir.cookies = await login(kasir.email);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function login(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.get('Set-Cookie') ?? [];
  }

  async function cleanup() {
    await prisma.recipeItem.deleteMany({});
    await prisma.product.deleteMany({});
    // Phase 4's purchasing rows must go first. `SupplierPurchaseItem` and
    // `StockMovement` both reference `RawMaterial` with `onDelete: Restrict`
    // (plan §8.4d), so the raw-material wipe below hits
    // `supplier_purchase_items_raw_material_id_fkey` on any seeded database.
    await prisma.payableSettlement.deleteMany({});
    await prisma.payable.deleteMany({});
    await prisma.supplierPurchaseItem.deleteMany({});
    await prisma.supplierPurchase.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.rawMaterial.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [owner.email, admin.email, kasir.email],
        },
      },
    });
    await prisma.branch.deleteMany({
      where: { name: 'MD Test Branch' },
    });
  }

  describe('Authentication & Role Guards', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/raw-materials')
        .expect(401);

      await request(app.getHttpServer()).get('/api/v1/products').expect(401);
    });

    it('allows KASIR to read raw materials and products (200 OK)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/raw-materials')
        .set('Cookie', kasir.cookies)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Cookie', kasir.cookies)
        .expect(200);
    });

    it('blocks KASIR from creating/updating/deleting master data with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/raw-materials')
        .set('Cookie', kasir.cookies)
        .send({ name: 'Forbidden RM', unit: 'kg', unitCost: '1000.00' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', kasir.cookies)
        .send({ name: 'Forbidden Product', sellPrice: '10000.00' })
        .expect(403);
    });

    it('allows ADMIN and OWNER write operations', async () => {
      const rmRes = await request(app.getHttpServer())
        .post('/api/v1/raw-materials')
        .set('Cookie', admin.cookies)
        .send({ name: 'Tepung Admin', unit: 'kg', unitCost: '15000.00' })
        .expect(201);

      const rmBody = rmRes.body as RawMaterialResponse;
      expect(rmBody.name).toBe('Tepung Admin');

      const prodRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', owner.cookies)
        .send({ name: 'Roti Owner', sellPrice: '25000.00' })
        .expect(201);

      const prodBody = prodRes.body as ProductResponse;
      expect(prodBody.name).toBe('Roti Owner');
    });
  });

  describe('Validation & Edge Cases', () => {
    it('rejects over-precise money (3dp) and quantity (5dp) at the edge', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/raw-materials')
        .set('Cookie', owner.cookies)
        .send({ name: 'Bad Decimal RM', unit: 'kg', unitCost: '15000.123' })
        .expect(400);

      const rm = await prisma.rawMaterial.create({
        data: { name: 'Valid RM', unit: 'kg', unitCost: '10000.00' },
      });

      const prod = await prisma.product.create({
        data: { name: 'Valid Prod', sellPrice: '20000.00' },
      });

      await request(app.getHttpServer())
        .put(`/api/v1/products/${prod.id}/recipe`)
        .set('Cookie', owner.cookies)
        .send({
          items: [{ rawMaterialId: rm.id, quantityUsed: '1.23456' }],
        })
        .expect(400);
    });

    it('rejects duplicate rawMaterialId in the same replace recipe payload', async () => {
      const rm = await prisma.rawMaterial.create({
        data: { name: 'Dup Test RM', unit: 'kg', unitCost: '10000.00' },
      });
      const prod = await prisma.product.create({
        data: { name: 'Dup Test Prod', sellPrice: '20000.00' },
      });

      await request(app.getHttpServer())
        .put(`/api/v1/products/${prod.id}/recipe`)
        .set('Cookie', owner.cookies)
        .send({
          items: [
            { rawMaterialId: rm.id, quantityUsed: '0.1000' },
            { rawMaterialId: rm.id, quantityUsed: '0.2000' },
          ],
        })
        .expect(400);
    });

    it('returns 409 Conflict when creating a raw material or product with a duplicate name', async () => {
      await prisma.rawMaterial.create({
        data: { name: 'Unique RM', unit: 'kg', unitCost: '10000.00' },
      });

      await request(app.getHttpServer())
        .post('/api/v1/raw-materials')
        .set('Cookie', owner.cookies)
        .send({ name: 'Unique RM', unit: 'kg', unitCost: '12000.00' })
        .expect(409);

      await prisma.product.create({
        data: { name: 'Unique Prod', sellPrice: '10000.00' },
      });

      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Cookie', owner.cookies)
        .send({ name: 'Unique Prod', sellPrice: '12000.00' })
        .expect(409);
    });

    it('blocks raw material deletion with 409 Conflict if used by a recipe', async () => {
      const rm = await prisma.rawMaterial.create({
        data: { name: 'Used RM', unit: 'kg', unitCost: '10000.00' },
      });
      const prod = await prisma.product.create({
        data: { name: 'Using Prod', sellPrice: '20000.00' },
      });
      await prisma.recipeItem.create({
        data: {
          productId: prod.id,
          rawMaterialId: rm.id,
          quantityUsed: '1.0000',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/raw-materials/${rm.id}`)
        .set('Cookie', owner.cookies)
        .expect(409);
    });

    it('cascades recipe items when product is deleted', async () => {
      const rm = await prisma.rawMaterial.create({
        data: { name: 'Cascade RM', unit: 'kg', unitCost: '10000.00' },
      });
      const prod = await prisma.product.create({
        data: { name: 'Cascade Prod', sellPrice: '20000.00' },
      });
      await prisma.recipeItem.create({
        data: {
          productId: prod.id,
          rawMaterialId: rm.id,
          quantityUsed: '1.0000',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${prod.id}`)
        .set('Cookie', owner.cookies)
        .expect(204);

      const remainingRecipe = await prisma.recipeItem.findMany({
        where: { productId: prod.id },
      });
      expect(remainingRecipe).toHaveLength(0);

      // Raw material survives
      const rmCheck = await prisma.rawMaterial.findUnique({
        where: { id: rm.id },
      });
      expect(rmCheck).not.toBeNull();
    });
  });

  describe('HPP & Recipe Endpoints (Option A & R1)', () => {
    it('returns 200 OK with empty items, hpp: null, hasRecipe: false for a product without recipe', async () => {
      const prod = await prisma.product.create({
        data: { name: 'No Recipe Drink', sellPrice: '5000.00' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${prod.id}/recipe`)
        .set('Cookie', kasir.cookies)
        .expect(200);

      const body = res.body as RecipeEnvelopeResponse;
      expect(body.recipe).toEqual({
        productId: prod.id,
        items: [],
        hpp: null,
        hasRecipe: false,
      });
      expect(body.product.hpp).toBeNull();
      expect(body.product.hasRecipe).toBe(false);
      expect(body.product.makeableQuantity).toBeNull();
    });

    it('calculates HPP, makeableQuantity, margin and preserves string scale ("4530.00")', async () => {
      const gula = await prisma.rawMaterial.create({
        data: {
          name: 'HPP Gula',
          unit: 'kg',
          unitCost: '12000.00',
          currentStock: '10.0000',
        },
      });
      const kopi = await prisma.rawMaterial.create({
        data: {
          name: 'HPP Kopi',
          unit: 'kg',
          unitCost: '85000.00',
          currentStock: '5.0000',
        },
      });
      const esKopi = await prisma.product.create({
        data: {
          name: 'HPP Es Kopi Susu',
          sellPrice: '18000.00',
        },
      });

      // Recipe: 0.25 kg Gula (3000) + 0.018 kg Kopi (1530) = HPP 4530.00
      const putRes = await request(app.getHttpServer())
        .put(`/api/v1/products/${esKopi.id}/recipe`)
        .set('Cookie', owner.cookies)
        .send({
          items: [
            { rawMaterialId: gula.id, quantityUsed: '0.2500' },
            { rawMaterialId: kopi.id, quantityUsed: '0.0180' },
          ],
        })
        .expect(200);

      const putBody = putRes.body as RecipeEnvelopeResponse;

      // Assert literal scale strings (§9.3)
      expect(putBody.product.sellPrice).toBe('18000.00');
      expect(putBody.product.hpp).toBe('4530.00');
      expect(putBody.product.margin).toBe('13470.00'); // 18000 - 4530 = 13470.00
      expect(putBody.product.hasRecipe).toBe(true);

      // Makeable quantity: min( floor(10 / 0.25) = 40, floor(5 / 0.018) = 277 ) = 40
      expect(putBody.product.makeableQuantity).toBe(40);

      // Verify GET returns identical envelope (§9.7a)
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${esKopi.id}/recipe`)
        .set('Cookie', kasir.cookies)
        .expect(200);

      const getBody = getRes.body as RecipeEnvelopeResponse;
      expect(getBody).toEqual(putBody);
    });

    it('updates live HPP immediately when RawMaterial unitCost is updated without mutating products table', async () => {
      const rm = await prisma.rawMaterial.create({
        data: { name: 'Dynamic RM', unit: 'kg', unitCost: '10000.00' },
      });
      const prod = await prisma.product.create({
        data: { name: 'Dynamic Prod', sellPrice: '30000.00' },
      });
      await prisma.recipeItem.create({
        data: {
          productId: prod.id,
          rawMaterialId: rm.id,
          quantityUsed: '1.0000',
        },
      });

      // Initial HPP: 10000.00
      let prodRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${prod.id}`)
        .set('Cookie', kasir.cookies)
        .expect(200);

      let prodBody = prodRes.body as ProductWithHppResponse;
      expect(prodBody.hpp).toBe('10000.00');

      // Update unitCost on RawMaterial to 15000.00
      await request(app.getHttpServer())
        .patch(`/api/v1/raw-materials/${rm.id}`)
        .set('Cookie', owner.cookies)
        .send({ unitCost: '15000.00' })
        .expect(200);

      // Read product again -> HPP is live updated to 15000.00
      prodRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${prod.id}`)
        .set('Cookie', kasir.cookies)
        .expect(200);

      prodBody = prodRes.body as ProductWithHppResponse;
      expect(prodBody.hpp).toBe('15000.00');
    });
  });
});
