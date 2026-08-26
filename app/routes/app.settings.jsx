import {
  Form,
  useActionData,
  useLoaderData,
} from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  let settings = await prisma.referralSettings.findUnique({
    where: {
      shop,
    },
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await prisma.referralSettings.create({
      data: {
        shop,
      },
    });
  }

  return { settings };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  const formData = await request.formData();

  const enabled = formData.get("enabled") === "true";

  const ambassadorEligibilityAmount = Number(
    formData.get("ambassadorEligibilityAmount")
  );

  const invitationValidityDays = Number(
    formData.get("invitationValidityDays")
  );

  const firstOrderCredit = Number(
    formData.get("firstOrderCredit")
  );

  const firstOrderCreditEnabled =
    formData.get("firstOrderCreditEnabled") === "true";

  const creditExpiryDaysValue =
    formData.get("creditExpiryDays");

  const creditExpiryDays =
    creditExpiryDaysValue === ""
      ? null
      : Number(creditExpiryDaysValue);

  const commissionRate = Number(
    formData.get("commissionRate")
  );

  const referralAttribution =
    formData.get("referralAttribution");

  const commissionOnPaidOrders =
    formData.get("commissionOnPaidOrders") === "true";

  const excludeCancelledOrders =
    formData.get("excludeCancelledOrders") === "true";

  await prisma.referralSettings.upsert({
    where: {
      shop,
    },

    update: {
      enabled,
      ambassadorEligibilityAmount,
      invitationValidityDays,
      firstOrderCredit,
      firstOrderCreditEnabled,
      creditExpiryDays,
      commissionRate,
      referralAttribution,
      commissionOnPaidOrders,
      excludeCancelledOrders,
    },

    create: {
      shop,
      enabled,
      ambassadorEligibilityAmount,
      invitationValidityDays,
      firstOrderCredit,
      firstOrderCreditEnabled,
      creditExpiryDays,
      commissionRate,
      referralAttribution,
      commissionOnPaidOrders,
      excludeCancelledOrders,
    },
  });

  return {
    success: true,
    message: "Program settings saved successfully.",
  };
}

export default function ProgramSettings() {
  const { settings } = useLoaderData();
  const actionData = useActionData();

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "32px",
          fontWeight: "700",
          marginBottom: "8px",
        }}
      >
        Program Settings
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "30px",
        }}
      >
        Configure your JOYSHOP Ambassador referral program.
      </p>

      {actionData?.success && (
        <div
          style={{
            background: "#e8f5e9",
            color: "#16803c",
            border: "1px solid #b7dfbd",
            borderRadius: "8px",
            padding: "14px 18px",
            marginBottom: "24px",
            fontWeight: "600",
          }}
        >
          ✓ {actionData.message}
        </div>
      )}

      <Form method="post">

        {/* PROGRAM STATUS */}

        <div style={cardStyle}>
          <h2 style={headingStyle}>
            Program Status
          </h2>

          <p style={descriptionStyle}>
            Turn the ambassador referral program on or off.
          </p>

          <input
            type="hidden"
            name="enabled"
            value="false"
          />

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked={settings.enabled}
              style={checkboxStyle}
            />

            <span>
              <strong>Enable referral program</strong>

              <small style={smallStyle}>
                Allow customers to participate in the ambassador program.
              </small>
            </span>
          </label>
        </div>


        {/* AMBASSADOR SETTINGS */}

        <div style={cardStyle}>
          <h2 style={headingStyle}>
            Ambassador Eligibility
          </h2>

          <p style={descriptionStyle}>
            Define when a customer can become an ambassador.
          </p>

          <label style={labelStyle}>
            Minimum customer spending amount
          </label>

          <div style={inputWrapperStyle}>
            <span style={prefixStyle}>₹</span>

            <input
              type="number"
              name="ambassadorEligibilityAmount"
              min="0"
              step="1"
              defaultValue={
                settings.ambassadorEligibilityAmount
              }
              style={inputStyle}
            />
          </div>

          <small style={helpStyle}>
            Customers must spend at least this amount to qualify
            as an ambassador.
          </small>

          <label style={labelStyle}>
            Invitation validity
          </label>

          <div style={inputWrapperStyle}>
            <input
              type="number"
              name="invitationValidityDays"
              min="1"
              step="1"
              defaultValue={
                settings.invitationValidityDays
              }
              style={inputStyle}
            />

            <span style={suffixStyle}>
              days
            </span>
          </div>
        </div>


        {/* CUSTOMER CREDIT */}

        <div style={cardStyle}>
          <h2 style={headingStyle}>
            Customer Referral Credit
          </h2>

          <p style={descriptionStyle}>
            Configure the reward given to a customer after
            joining through a referral.
          </p>

          <input
            type="hidden"
            name="firstOrderCreditEnabled"
            value="false"
          />

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              name="firstOrderCreditEnabled"
              value="true"
              defaultChecked={
                settings.firstOrderCreditEnabled
              }
              style={checkboxStyle}
            />

            <span>
              <strong>Enable first-order credit</strong>

              <small style={smallStyle}>
                Give referred customers a credit for their first order.
              </small>
            </span>
          </label>

          <label style={labelStyle}>
            First-order credit amount
          </label>

          <div style={inputWrapperStyle}>
            <span style={prefixStyle}>₹</span>

            <input
              type="number"
              name="firstOrderCredit"
              min="0"
              step="1"
              defaultValue={
                settings.firstOrderCredit
              }
              style={inputStyle}
            />
          </div>

          <label style={labelStyle}>
            Credit expiry
          </label>

          <div style={inputWrapperStyle}>
            <input
              type="number"
              name="creditExpiryDays"
              min="1"
              step="1"
              defaultValue={
                settings.creditExpiryDays ?? ""
              }
              placeholder="No expiry"
              style={inputStyle}
            />

            <span style={suffixStyle}>
              days
            </span>
          </div>

          <small style={helpStyle}>
            Leave empty if customer credits should never expire.
          </small>
        </div>


        {/* COMMISSION */}

        <div style={cardStyle}>
          <h2 style={headingStyle}>
            Ambassador Commission
          </h2>

          <p style={descriptionStyle}>
            Configure how ambassadors earn commission.
          </p>

          <label style={labelStyle}>
            Commission rate
          </label>

          <div style={inputWrapperStyle}>
            <input
              type="number"
              name="commissionRate"
              min="0"
              max="100"
              step="0.1"
              defaultValue={
                settings.commissionRate
              }
              style={inputStyle}
            />

            <span style={suffixStyle}>
              %
            </span>
          </div>

          <small style={helpStyle}>
            Example: 10 means the ambassador earns 10% of the
            qualifying order amount.
          </small>

          <input
            type="hidden"
            name="commissionOnPaidOrders"
            value="false"
          />

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              name="commissionOnPaidOrders"
              value="true"
              defaultChecked={
                settings.commissionOnPaidOrders
              }
              style={checkboxStyle}
            />

            <span>
              <strong>
                Commission only on paid orders
              </strong>

              <small style={smallStyle}>
                Commission is generated only after the order is paid.
              </small>
            </span>
          </label>

          <input
            type="hidden"
            name="excludeCancelledOrders"
            value="false"
          />

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              name="excludeCancelledOrders"
              value="true"
              defaultChecked={
                settings.excludeCancelledOrders
              }
              style={checkboxStyle}
            />

            <span>
              <strong>
                Exclude cancelled orders
              </strong>

              <small style={smallStyle}>
                Cancelled orders will not generate commission.
              </small>
            </span>
          </label>
        </div>


        {/* ATTRIBUTION */}

        <div style={cardStyle}>
          <h2 style={headingStyle}>
            Referral Attribution
          </h2>

          <p style={descriptionStyle}>
            Decide which ambassador receives credit when
            multiple referral links are used.
          </p>

          <label style={labelStyle}>
            Attribution method
          </label>

          <select
            name="referralAttribution"
            defaultValue={
              settings.referralAttribution
            }
            style={selectStyle}
          >
            <option value="FIRST_VALID">
              First valid referral
            </option>

            <option value="LAST_VALID">
              Last valid referral
            </option>
          </select>

          <small style={helpStyle}>
            First valid referral keeps the first qualifying
            ambassador attached to the customer.
          </small>
        </div>


        {/* SAVE */}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "24px",
            marginBottom: "40px",
          }}
        >
          <button
            type="submit"
            style={{
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "13px 28px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Save Settings
          </button>
        </div>

      </Form>
    </div>
  );
}


/* STYLES */

const cardStyle = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: "12px",
  padding: "26px",
  marginBottom: "20px",
};

const headingStyle = {
  fontSize: "21px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const descriptionStyle = {
  color: "#666",
  marginTop: "0",
  marginBottom: "22px",
  fontSize: "14px",
};

const labelStyle = {
  display: "block",
  fontWeight: "600",
  marginTop: "22px",
  marginBottom: "8px",
  fontSize: "14px",
};

const inputWrapperStyle = {
  display: "flex",
  alignItems: "center",
  border: "1px solid #bbb",
  borderRadius: "7px",
  maxWidth: "400px",
  overflow: "hidden",
};

const prefixStyle = {
  paddingLeft: "12px",
  fontWeight: "600",
};

const suffixStyle = {
  paddingRight: "12px",
  color: "#666",
};

const inputStyle = {
  width: "100%",
  border: "none",
  outline: "none",
  padding: "11px",
  fontSize: "15px",
};

const selectStyle = {
  width: "100%",
  maxWidth: "400px",
  padding: "11px",
  border: "1px solid #bbb",
  borderRadius: "7px",
  fontSize: "15px",
  background: "#fff",
};

const helpStyle = {
  display: "block",
  color: "#777",
  fontSize: "12px",
  marginTop: "7px",
};

const checkboxLabelStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  marginTop: "18px",
  cursor: "pointer",
};

const checkboxStyle = {
  width: "18px",
  height: "18px",
  marginTop: "2px",
};

const smallStyle = {
  display: "block",
  color: "#777",
  fontSize: "12px",
  fontWeight: "400",
  marginTop: "4px",
};