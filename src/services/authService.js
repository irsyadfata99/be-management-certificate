const UserModel = require("../models/userModel");
const JwtHelper = require("../utils/jwtHelper");

class AuthService {
  /**
   * Login user and generate tokens
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} User data and tokens
   */
  static async login(username, password) {
    try {
      // Find user by username
      const user = await UserModel.findByUsername(username);

      if (!user) {
        throw new Error("Invalid credentials");
      }

      // Verify password
      const isPasswordValid = await UserModel.verifyPassword(
        password,
        user.password,
      );

      if (!isPasswordValid) {
        throw new Error("Invalid credentials");
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
      };

      const accessToken = JwtHelper.generateAccessToken(tokenPayload);
      const refreshToken = JwtHelper.generateRefreshToken({ userId: user.id });

      // Return user data (without password) and tokens
      return {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user profile by ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User data
   */
  static async getProfile(userId) {
    try {
      const user = await UserModel.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Change username
   * @param {number} userId - User ID
   * @param {string} newUsername - New username
   * @param {string} currentPassword - Current password for verification
   * @returns {Promise<Object>} Updated user data
   */
  static async changeUsername(userId, newUsername, currentPassword) {
    try {
      // Get current user data
      const user = await UserModel.findByUsername(
        (await UserModel.findById(userId)).username,
      );

      if (!user) {
        throw new Error("User not found");
      }

      // Verify current password
      const isPasswordValid = await UserModel.verifyPassword(
        currentPassword,
        user.password,
      );

      if (!isPasswordValid) {
        throw new Error("Invalid password");
      }

      // Check if new username already exists
      const existingUser = await UserModel.findByUsername(newUsername);

      if (existingUser && existingUser.id !== userId) {
        throw new Error("Username already exists");
      }

      // Update username
      const updatedUser = await UserModel.updateUsername(userId, newUsername);

      return updatedUser;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Change password
   * @param {number} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Updated user data
   */
  static async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get current user data with password
      const currentUser = await UserModel.findById(userId);

      if (!currentUser) {
        throw new Error("User not found");
      }

      // Get user with password to verify
      const userWithPassword = await UserModel.findByUsername(
        currentUser.username,
      );

      // Verify current password
      const isPasswordValid = await UserModel.verifyPassword(
        currentPassword,
        userWithPassword.password,
      );

      if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      // Check if new password is same as current
      const isSamePassword = await UserModel.verifyPassword(
        newPassword,
        userWithPassword.password,
      );

      if (isSamePassword) {
        throw new Error("New password must be different from current password");
      }

      // Update password
      const updatedUser = await UserModel.updatePassword(userId, newPassword);

      return updatedUser;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New access token
   */
  static async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = JwtHelper.verifyRefreshToken(refreshToken);

      // Get user data
      const user = await UserModel.findById(decoded.userId);

      if (!user) {
        throw new Error("User not found");
      }

      // Generate new access token
      const tokenPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
      };

      const accessToken = JwtHelper.generateAccessToken(tokenPayload);

      return { accessToken };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AuthService;
