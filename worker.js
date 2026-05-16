const ALLOWED_ORIGINS = [
  "https://hspsystems.io",
  "https://www.hspsystems.io",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders(origin) });
    }

    if (request.method === "POST" && pathname === "/submit") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid JSON" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
        );
      }

      const { firstName, lastName, email, phone, companyName, website, industry, message } = body;

      const industryMap = {
        "Landscaping / Outdoor Living": "landscaping__outdoor_living",
        "House Cleaning": "house_cleaning",
        "Commercial Cleaning": "commercial_cleaning",
        "Painting": "painting",
        "Roofing": "roofing",
        "HVAC / Plumbing / Electrical": "hvac__plumbing__electrical",
        "Remodeling / Construction": "remodeling__construction",
        "Tree Service": "tree_service",
        "Pressure Washing": "pressure_washing",
        "Junk Removal": "junk_removal",
        "Sign Company / Signage": "sign_company__signage",
        "Medical Office": "medical_office",
        "Dental Office": "dental_office",
        "Eye Care / Optometry": "eye_care__optometry",
        "Chiropractic / Physical Therapy": "chiropractic__physical_therapy",
        "Veterinary": "veterinary",
        "Salon / Spa / Beauty": "salon__spa__beauty",
        "Auto Repair / Detailing": "auto_repair__detailing",
        "Property Management": "property_management",
        "Other Home Service": "other_home_service",
        "Other Business": "other_business"
      };
      const industryValue = industryMap[industry] || industry;
      const industryTag = industryValue;

      const isPartial = body.message === 'PARTIAL — Step 1 only';
      const tags = [
        industryTag,
        'website-lead',
        isPartial ? 'website-lead-partial' : 'website-lead-complete'
      ];

      const ghlPayload = {
        firstName,
        lastName,
        email,
        phone,
        name: `${firstName} ${lastName}`,
        companyName,
        website,
        locationId: env.GHL_LOCATION_ID,
        source: "HSP Website Form",
        tags,
        customFields: [
          { key: "biggest_problem", field_value: message },
          { key: "industry", field_value: industryValue },
        ],
      };

      let ghlRes;
      try {
        ghlRes = await fetch("https://services.leadconnectorhq.com/contacts/", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GHL_API_KEY}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ghlPayload),
        });
      } catch (err) {
        console.error("GHL fetch error:", err);
        return new Response(
          JSON.stringify({ success: false, error: "GHL fetch threw", ghlError: err.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
        );
      }

      if (ghlRes.status === 200 || ghlRes.status === 201) {
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
        );
      }

      const errText = await ghlRes.text().catch(() => "(unreadable)");
      console.error(`GHL error ${ghlRes.status}:`, errText);

      // Duplicate contact — GHL returns the contactId in the error, use it to update
      if (ghlRes.status === 400 && /duplicat/i.test(errText)) {
        try {
          const errJson = JSON.parse(errText);
          const contactId = errJson?.meta?.contactId;
          if (contactId) {
            const updatePayload = {
              firstName,
              lastName,
              name: `${firstName} ${lastName}`,
              phone,
              companyName,
              website,
              tags,
              customFields: ghlPayload.customFields,
            };
            const updateRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${env.GHL_API_KEY}`,
                Version: "2021-07-28",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(updatePayload),
            });
            const updateBody = await updateRes.text().catch(() => "");
            console.log("GHL update status:", updateRes.status, updateBody);
          } else {
            console.error("Duplicate but no contactId in error:", errText);
          }
        } catch (updateErr) {
          console.error("GHL update on duplicate failed:", updateErr);
        }
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "Contact creation failed", ghlStatus: ghlRes.status, ghlBody: errText }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
