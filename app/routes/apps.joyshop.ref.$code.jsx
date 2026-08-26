import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }) => {
  // Authenticate the Shopify App Proxy request
  const { session } = await authenticate.public.appProxy(request);

  const code = params.code;

  if (!code) {
    return new Response("Referral code is missing.", {
      status: 400,
    });
  }

  console.log("====================================");
  console.log("REFERRAL CODE:", code);

  // Shopify provides the shop in the proxy URL
  const url = new URL(request.url);

  const shop =
    session?.shop ||
    url.searchParams.get("shop");

  console.log("REQUEST SHOP:", shop);

  if (!shop) {
    return new Response("Shop information is missing.", {
      status: 400,
    });
  }

  // Find the ambassador
  const ambassador = await db.ambassador.findFirst({
    where: {
      referralCode: code,
      shop: shop,
    },
  });

  if (!ambassador) {
    console.log("====================================");
    console.log("AMBASSADOR NOT FOUND");
    console.log("CODE:", code);
    console.log("SHOP:", shop);
    console.log("====================================");

    return new Response("Referral link not found.", {
      status: 404,
    });
  }

  console.log("====================================");
  console.log("AMBASSADOR FOUND:", ambassador.name);
  console.log("REFERRAL CODE:", ambassador.referralCode);
  console.log("SHOP:", ambassador.shop);
  console.log("====================================");

  /*
   * IMPORTANT:
   *
   * App Proxy does NOT support cookies.
   * Shopify strips Set-Cookie from proxy responses.
   *
   * So we keep the referral code in the URL for now.
   */

  const redirectUrl = new URL(`https://${shop}/`);

redirectUrl.searchParams.set(
  "ref",
  ambassador.referralCode
);

  console.log(
    "REDIRECTING TO:",
    redirectUrl.toString()
  );

  return redirect(redirectUrl.toString());
};