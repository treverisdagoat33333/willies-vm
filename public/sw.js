importScripts("/controller/controller.api.js");

self.addEventListener("fetch", (event) => {
	if ($scramjetController.shouldRoute(event)) {
		event.respondWith($scramjetController.route(event));
		return;
	}
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim())
);

self.addEventListener("message", () => {
});
