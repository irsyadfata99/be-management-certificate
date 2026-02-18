const jwt = require("jsonwebtoken");
const jwtConfig = require("../config/jwt");

class JwtHelper {
  static generateAccessToken(payload) {
    return jwt.sign(payload, jwtConfig.accessToken.secret, {
      expiresIn: jwtConfig.accessToken.expiresIn,
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience,
    });
  }

  static generateRefreshToken(payload) {
    return jwt.sign(payload, jwtConfig.refreshToken.secret, {
      expiresIn: jwtConfig.refreshToken.expiresIn,
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience,
    });
  }

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

  static decode(token) {
    return jwt.decode(token, { complete: true });
  }
}

module.exports = JwtHelper;
