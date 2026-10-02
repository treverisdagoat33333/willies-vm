/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Loaded with --import before server.js in tests. The test site runs on
// 127.0.0.1, which wisp and fast mode refuse in production; this lets them
// reach it. With WJ_STRICT=1 it does nothing, for the fast-mode guard tests.
import { server } from "@mercuryworkshop/wisp-js/server";
import { setAllowPrivate } from "../fastnet.js";

if (!process.env.WJ_STRICT) {
  server.options.allow_loopback_ips = true;
  server.options.allow_private_ips = true;
  setAllowPrivate(true);
}
