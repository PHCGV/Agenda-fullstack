import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { sendError } from "../utils/http.js";

/**
 * Valida o token JWT de acesso e injeta o usuario autenticado na requisicao.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @param {import("express").NextFunction} next Proximo middleware da cadeia.
 * @return {void}
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "Missing authorization token");
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      role: payload.role
    };
    return next();
  } catch (error) {
    return sendError(res, 401, "Invalid or expired token");
  }
}

/**
 * Cria um middleware que restringe a rota a um ou mais papeis de usuario.
 *
 * @param {string|string[]} role Papel aceito ou lista de papeis aceitos.
 * @return {import("express").RequestHandler} Middleware de autorizacao por role.
 */
export function requireRole(role) {
  return (req, res, next) => {
    const allowedRoles = Array.isArray(role) ? role : [role];
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, "Insufficient permissions");
    }
    return next();
  };
}
