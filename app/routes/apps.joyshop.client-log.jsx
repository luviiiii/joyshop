import { authenticate } from "../shopify.server";

/*
 * POST /apps/joyshop/client-log
 *
 * Receives the startup error report from the ambassador dashboard
 * when its JavaScript fails to start on a device, and prints it in
 * the Railway Deploy Logs (search for "DASHBOARD CLIENT ERROR").
 */
export const action = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const text = (await request.text()).slice(0, 20000);

    let report;
    try {
      report = JSON.parse(text);
    } catch {
      report = { raw: text };
    }

    console.log("========================================");
    console.log("DASHBOARD CLIENT ERROR");
    console.log(JSON.stringify(report, null, 2));
    console.log("========================================");
  } catch (error) {
    console.error("CLIENT LOG ROUTE ERROR:", error);
  }

  return new Response(null, { status: 204 });
};

export const loader = () => new Response("Not found", { status: 404 });
