const jwt = require("jsonwebtoken");
const jwtConfig = require("../config/jwt");

class JwtHelper {
  /**
   * Generate access token
   * @param {Object} payload - Data to encode in token (userId, username, role)
   * @returns {string} JWT access token
   */
  static generateAccessToken(payload) {
    return jwt.sign(payload, jwtConfig.accessToken.secret, {
      expiresIn: jwtConfig.accessToken.expiresIn,
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience,
    });
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Data to encode in token (userId)
   * @returns {string} JWT refresh token
   */
  static generateRefreshToken(payload) {
    return jwt.sign(payload, jwtConfig.refreshToken.secret, {
      expiresIn: jwtConfig.refreshToken.expiresIn,
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience,
    });
  }

  /**
   * Verify access token
   * @param {string} token - JWT access token to verify
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, jwtConfig.accessToken.secret, {
        issuer: jwtConfig.options.issuer,
        audience: jwtConfig.options.audience,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify refresh token
   * @param {string} token - JWT refresh token to verify
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, jwtConfig.refreshToken.secret, {
        issuer: jwtConfig.options.issuer,
        audience: jwtConfig.options.audience,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded token
   */
  static decode(token) {
    return jwt.decode(token, { complete: true });
  }
}

module.exports = JwtHelper;
