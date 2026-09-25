/* Ultraviolet settings, read by the service worker (public/sw.js), the
   browser page and every page Ultraviolet proxies. Served at /uv/uv.config.js
   in place of the package's stock one. */
self.__uv$config = {
  prefix: "/~/uv/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  client: "/uv/uv.client.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/uv/uv.sw.js",
};
