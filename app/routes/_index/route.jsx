import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If Shopify sends us a shop, continue to the app
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>
          JoyShop Referral & Ambassador Platform
        </h1>

        <p className={styles.text}>
          Manage your Shopify referrals, ambassadors, commissions, and payouts
          from one place.
        </p>

        {showForm && (
          <Form
            className={styles.form}
            method="post"
            action="/auth/login"
          >
            <label className={styles.label}>
              <span>Shop domain</span>

              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
              />

              <span>e.g. your-store.myshopify.com</span>
            </label>

            <button className={styles.button} type="submit">
              Log in to JoyShop
            </button>
          </Form>
        )}

        <ul className={styles.list}>
          <li>
            <strong>Referral Tracking</strong>
            <br />
            Track referrals and monitor conversions from your ambassadors.
          </li>

          <li>
            <strong>Commission Management</strong>
            <br />
            Manage commissions and keep your ambassador earnings organized.
          </li>

          <li>
            <strong>Payout Management</strong>
            <br />
            Track payouts and manage your ambassador payment workflow.
          </li>
        </ul>
      </div>
    </div>
  );
}