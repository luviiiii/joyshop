import { redirect } from "react-router";
import db from "../db.server";

export const loader = async ({ params }) => {
  const code = params.code;

  if (!code) {
    return new Response("Affiliate code is missing.", {
      status: 400,
    });
  }

  console.log("AFFILIATE TRACKING CODE:", code);

  const affiliate = await db.affiliate.findUnique({
    where: {
      code: code,
    },
  });

  if (!affiliate) {
    console.log("AFFILIATE NOT FOUND:", code);

    return new Response("Affiliate link not found.", {
      status: 404,
    });
  }

  console.log("AFFILIATE FOUND:", affiliate.name);

  // Increase click count
  await db.affiliate.update({
    where: {
      id: affiliate.id,
    },
    data: {
      clicks: {
        increment: 1,
      },
    },
  });

  console.log("CLICK COUNT UPDATED");

  // Create affiliate cookie
  const cookieValue = encodeURIComponent(affiliate.code);

  const headers = new Headers();

  headers.append(
    "Set-Cookie",
    `joyshop_ref=${cookieValue}; Path=/; Max-Age=2592000; SameSite=Lax`
  );

  // Original product URL
  const productUrl = new URL(affiliate.product);

  // Keep the affiliate reference in the product URL
  productUrl.searchParams.set("ref", affiliate.code);

  console.log("REDIRECTING TO:", productUrl.toString());

  return redirect(productUrl.toString(), {
    headers,
  });
};