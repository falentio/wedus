import { Router } from "https://esm.sh/itty-router@2.4.4";
import { listenAndServe } from "https://deno.land/std@0.113.0/http/mod.ts";

const PORT: string = ":" + (Deno.env.get("PORT") || "8080");
const router = Router();
const WEB3TOKEN = Deno.env.get("WEB3TOKEN");
if (WEB3TOKEN === undefined) {
	console.error("cannt find WEB3TOKEN env variable");
	Deno.exit(1);
}

const limit: Record<string, { remain?: number; date?: number }> = {};

router.all("*", (request, conn) => {
	console.log("[" + request.method + "] " + request.url);
	const e: string = conn.remoteAddr.hostname + "";
	limit[e] ??= {};
	limit[e].date ??= Date.now() + 1000;
	limit[e].remain ??= 2;
	if (limit[e].date as number < Date.now()) {
		limit[e].date = Date.now() + 1000;
		limit[e].remain = 2;
	}
	if (limit[e].remain as number < 1) {
		return new Response(
			JSON.stringify({
				success: false,
				message: "too much request",
			}),
			{
				status: 429,
				headers: {
					"content-type": "application/json",
				},
			},
		);
	}
	limit[e].remain = limit[e].remain as number - 1;
});

router.post("/create", async (request) => {
	const body = new FormData();
	const blob = await request?.blob?.();
	if (blob === undefined) {
		return new Response(
			JSON.stringify({
				success: false,
				message: "body is required",
			}),
			{
				status: 400,
				headers: {
					"content-type": "application/json",
				},
			},
		);
	}
	if (blob.size > (1024 * 1024)) {
		return new Response(
			JSON.stringify({
				success: false,
				message: "body too large",
			}),
			{
				status: 413,
				headers: {
					"content-type": "application/json",
				},
			},
		);
	}
	const file = new File([blob], "wedus");
	body.append("file", file);
	const response = await fetch("https://api.web3.storage/upload", {
		method: "POST",
		body,
		headers: {
			"authorization": "Bearer " + WEB3TOKEN,
		},
	});
	const json: {
		cid?: string;
		name?: string;
		message?: string;
	} = await response.json().catch((_) => ({}));
	if (json.cid !== undefined) {
		return new Response(
			JSON.stringify({
				success: true,
				url: new URL("/#" + json.cid, request.url).href,
			}),
			{
				status: 201,
				headers: {
					"content-type": "application/json",
				},
			},
		);
	}
	if (json.name !== undefined && json.message !== undefined) {
		return new Response(
			JSON.stringify({
				message: "failed to create",
				success: false,
			}),
			{
				status: 400,
				headers: {
					"content-type": "application/json",
				},
			},
		);
	}
	return new Response("", {
		status: 500,
	});
});

router.get("/", async () => {
	const content = await Deno.readTextFile("./index.html");
	return new Response(content, {
		headers: {
			"content-type": "text/html",
			// "Cache-Control": "public, max-age=3600, immutable",
		},
	});
});

router.all("*", () =>
	new Response("redirect", {
		status: 301,
		headers: {
			location: "/#",
		},
	}));

listenAndServe(PORT, (request, conn) => {
	return router.handle(request, conn)
		.catch((e: unknown) => {
			console.error(e);
			return new Response("", {
				status: 500,
			});
		});
});