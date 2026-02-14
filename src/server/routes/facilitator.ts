import { Router } from "express";
import { getScheme } from "../../shared/schemes.js";

const router = Router();

/**
 * POST /facilitator/verify
 * x402 standard facilitator verification endpoint
 */
router.post("/verify", async (req, res) => {
  const { payload, paymentRequirements } = req.body;

  if (!payload?.scheme) {
    return res.status(400).json({ isValid: false, invalidReason: "Missing scheme in payload" });
  }

  const scheme = getScheme(payload.scheme);
  if (!scheme) {
    return res.status(400).json({ isValid: false, invalidReason: `Unknown scheme: ${payload.scheme}` });
  }

  try {
    const result = await scheme.verify(payload);
    return res.json({ isValid: result.valid, invalidReason: result.error });
  } catch (err) {
    return res.status(500).json({
      isValid: false,
      invalidReason: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

/**
 * POST /facilitator/settle
 * x402 standard facilitator settlement endpoint
 */
router.post("/settle", async (req, res) => {
  const { payload, paymentRequirements } = req.body;

  if (!payload?.scheme) {
    return res.status(400).json({ success: false, error: "Missing scheme in payload" });
  }

  const scheme = getScheme(payload.scheme);
  if (!scheme) {
    return res.status(400).json({ success: false, error: `Unknown scheme: ${payload.scheme}` });
  }

  try {
    const result = await scheme.settle(payload);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
