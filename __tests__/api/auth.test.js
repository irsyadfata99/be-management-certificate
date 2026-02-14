/**
 * Authentication Endpoints Tests
 */

const request = require("supertest");
const app = require("../../src/app");
const TestDatabase = require("../helpers/testDatabase");

describe("Authentication API", () => {
  beforeAll(async () => {
    await TestDatabase.init();
  });

  beforeEach(async () => {
    await TestDatabase.clear();
  });

  afterAll(async () => {
    await TestDatabase.close();
  });

  describe("POST /api/auth/login", () => {
    it("should login successfully with valid credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("refreshToken");
      expect(response.body.data.user).toHaveProperty("username", "gem");
      expect(response.body.data.user).toHaveProperty("role", "superAdmin");
    });

    it("should fail with invalid username", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "wronguser",
        password: "admin123",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Invalid");
    });

    it("should fail with invalid password", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "wrongpassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with missing credentials", async () => {
      const response = await request(app).post("/api/auth/login").send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with short username", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "ab",
        password: "admin123",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/auth/me", () => {
    it("should get current user profile with valid token", async () => {
      // Login first
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      // Get profile
      const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("username", "gem");
      expect(response.body.data).toHaveProperty("role", "superAdmin");
      expect(response.body.data).not.toHaveProperty("password");
    });

    it("should fail without token", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with invalid token", async () => {
      const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer invalid_token");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("should refresh access token with valid refresh token", async () => {
      // Login first
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { refreshToken } = loginResponse.body.data;

      // Wait a bit to ensure new token is different
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Refresh token
      const response = await request(app).post("/api/auth/refresh").send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("refreshToken");
    });

    it("should fail with invalid refresh token", async () => {
      const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "invalid_token" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with missing refresh token", async () => {
      const response = await request(app).post("/api/auth/refresh").send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("PATCH /api/auth/change-password", () => {
    it("should change password successfully", async () => {
      // Login first
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      // Change password
      const response = await request(app).patch("/api/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({
        currentPassword: "admin123",
        newPassword: "NewPass123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Try login with new password
      const newLoginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "NewPass123!",
      });

      expect(newLoginResponse.status).toBe(200);
      expect(newLoginResponse.body.success).toBe(true);

      // Old password should fail
      const oldLoginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      expect(oldLoginResponse.status).toBe(401);
    });

    it("should fail with wrong current password", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const response = await request(app).patch("/api/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({
        currentPassword: "wrongpassword",
        newPassword: "NewPass123!",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with weak new password", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const response = await request(app).patch("/api/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({
        currentPassword: "admin123",
        newPassword: "weak",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail when new password same as current", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const response = await request(app).patch("/api/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({
        currentPassword: "admin123",
        newPassword: "admin123",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("PATCH /api/auth/change-username", () => {
    it("should change username successfully", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const newUsername = global.testUtils.generateUsername("newgem");

      const response = await request(app).patch("/api/auth/change-username").set("Authorization", `Bearer ${accessToken}`).send({
        newUsername,
        currentPassword: "admin123",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Try login with new username
      const newLoginResponse = await request(app).post("/api/auth/login").send({
        username: newUsername,
        password: "admin123",
      });

      expect(newLoginResponse.status).toBe(200);
    });

    it("should fail with wrong password", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const response = await request(app).patch("/api/auth/change-username").set("Authorization", `Bearer ${accessToken}`).send({
        newUsername: "newgem",
        currentPassword: "wrongpassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with short username", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const response = await request(app).patch("/api/auth/change-username").set("Authorization", `Bearer ${accessToken}`).send({
        newUsername: "ab",
        currentPassword: "admin123",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout successfully", async () => {
      const loginResponse = await request(app).post("/api/auth/login").send({
        username: "gem",
        password: "admin123",
      });

      const { accessToken } = loginResponse.body.data;

      const response = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
