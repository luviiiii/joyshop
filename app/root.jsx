import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

/*
 * Exposes this app's real domain to every page, so we can set a
 * <base> tag. Without this, pages loaded through Shopify's App
 * Proxy (e.g. /apps/joyshop/dashboard on the storefront domain)
 * try to resolve script/link URLs like "/assets/entry.client.js"
 * against the STOREFRONT's origin instead of this app's origin,
 * causing 404s.
 *
 * A <base href="https://your-app-domain/"> tag fixes this at the
 * browser level: any absolute-path URL (starting with "/") in the
 * document resolves against the base href's origin instead of the
 * current page's origin — without needing to change how Vite or
 * react-router-serve generate or match asset URLs internally.
 */
export async function loader() {
  const appUrl = process.env.SHOPIFY_APP_URL || "";

  return {
    appUrl: appUrl ? `${appUrl.replace(/\/$/, "")}/` : null,
  };
}

export default function App() {
  const { appUrl } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {appUrl && <base href={appUrl} />}
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}