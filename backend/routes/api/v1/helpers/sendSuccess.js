export function sendSuccess(res, data = {}) {
  return res.status(200).json({ status: "success", ...data });
}
