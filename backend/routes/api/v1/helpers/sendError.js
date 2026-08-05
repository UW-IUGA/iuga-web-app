export function sendError(res, status, message) {
  const fallback =
    status === 500
      ? "There was an error on our side :("
      : "Something went wrong";
  return res
    .status(status)
    .json({ status: "error", message: message ?? fallback });
}
