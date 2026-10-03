import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Handles https://justorganik.com/apps/joyshop/ref/CODE
 *
 * Redirects to the storefront homepage with ?ref=CODE, where the
 * Referral Gate picks it up. The redirect is RELATIVE ("/?ref=…"),
 * so the visitor stays on justorganik.com instead of bouncing
 * through the .myshopify.com domain first.
 *
 * (App Proxy strips Set-Cookie, so the code travels in the URL and
 * the Referral Gate stores it in a cookie on the storefront.)
 */
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.public.appProxy(request);

  const code = params.code;

  if (!code) {
    return redirect("/");
  }

  const url = new URL(request.url);
  const shop = session?.shop || url.searchParams.get("shop");

  console.log("====================================");
  console.log("REFERRAL LINK CLICK:", code, "| SHOP:", shop);

  if (!shop) {
    return redirect("/");
  }

  const ambassador = await db.ambassador.findFirst({
    where: {
      shop,
      referralCode: code,
      status: "ACTIVE",
    },
  });

  if (!ambassador) {
    // Unknown or deactivated code: send them to the store anyway,
    // just without attaching a referral.
    console.log("AMBASSADOR NOT FOUND OR INACTIVE — redirecting without ref");
    console.log("====================================");
    return redirect("/");
  }

  const target = `/?ref=${encodeURIComponent(ambassador.referralCode)}`;

  console.log("AMBASSADOR:", ambassador.name, "→", target);
  console.log("====================================");

  return redirect(target);
};
