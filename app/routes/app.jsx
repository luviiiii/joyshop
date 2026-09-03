import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  AppProvider,
} from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>

        <s-link href="/app">
          Dashboard
        </s-link>

        <s-link href="/app/ambassadors">
          Ambassadors
        </s-link>

        <s-link href="/app/referrals">
          Referrals
        </s-link>

        <s-link href="/app/commissions">
          Commissions
        </s-link>

        <s-link href="/app/credits">
          Customer Credits
        </s-link>

        <s-link href="/app/payouts">
          Payouts
        </s-link>

        <s-link href="/app/settings">
          Program Settings
        </s-link>

        <s-link href="/app/applications">
          Applications
        </s-link>

      </s-app-nav>

      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};