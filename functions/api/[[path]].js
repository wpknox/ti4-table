import { handle } from "../../server/router.js";

export const onRequest = (ctx) => handle(ctx.request, ctx.env);
