export function notFound(req, res, next) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  const message = err.message ?? "Unexpected error";
  res.status(status).json({ error: message });
}
