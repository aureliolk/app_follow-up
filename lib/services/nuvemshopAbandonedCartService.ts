import { prisma } from '@/lib/db';




// Define a basic type for the Nuvemshop Abandoned Checkout API response
// This should be refined based on the actual API response structure
interface NuvemshopAbandonedCheckout {
  id: number;
  token: string;
  store_id: number;
  abandoned_checkout_url: string;
  contact_email: string;
  contact_name: string;
  contact_phone: string;
  created_at: string; // ISO 8601 format
  products: Array<{
    id: number;
    name: string;
    price: string;
    quantity: number;
    // Add other product properties as needed
  }>;
  // Add other properties from the API response as needed
}



export async function fetchAndProcessAbandonedCarts(workspaceId: string) {

  const hasIntegration = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      nuvemshopStoreId: true,
      nuvemshopApiKey: true,
    },
  });

  if (!hasIntegration || !hasIntegration.nuvemshopStoreId || !hasIntegration.nuvemshopApiKey) {
    // If no integration is found, log an error and return
    console.error(`Nuvemshop integration not found for workspace ${workspaceId}. Please set up the integration first.`);
    return null;
  }
 
  const NUVEISHOP_API_KEY = hasIntegration.nuvemshopApiKey;
  const NUVEISHOP_STORE_ID = hasIntegration.nuvemshopStoreId;

  try {
    const response = await fetch(
      `https://api.nuvemshop.com.br/2025-03/${NUVEISHOP_STORE_ID}/checkouts`,
      {
        headers: {
          'Authentication': `bearer ${NUVEISHOP_API_KEY}`,
          'User-Agent': '782202', // Replace with your app name and email
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Error fetching abandoned carts from Nuvemshop: ${response.status} - ${JSON.stringify(errorData)}`);
      return;
    }

    const abandonedCarts: NuvemshopAbandonedCheckout[] = await response.json();

    for (const cart of abandonedCarts) {
      // Check if this abandoned cart already exists in our database
      // This assumes you have an AbandonedCart model in your Prisma schema
      const existingCart = await prisma.abandonedCart.findUnique({
        where: { nuvemshopCheckoutId: cart.id.toString() }, // Assuming nuvemshopCheckoutId is a string in your schema
      });

      if (!existingCart) {
        // Save the new abandoned cart to our database
        // You'll need to create the AbandonedCart model in prisma/schema.prisma first
        await prisma.abandonedCart.create({
          data: {
            nuvemshopCheckoutId: cart.id.toString(),
            workspaceId: workspaceId, // Associate with the correct workspace
            customerEmail: cart.contact_email,
            customerName: cart.contact_name,
            customerPhone: cart.contact_phone,
            checkoutUrl: cart.abandoned_checkout_url,
            status: 'PENDING', // Initial status
            createdAt: new Date(cart.created_at),
            // Store product details as JSON or link to a separate model
            products: JSON.stringify(cart.products),
            // Add other fields as needed from the Nuvemshop API response
          },
        });
        console.log(`New abandoned cart ${cart.id} saved to database.`);
      } else {
        console.log(`Abandoned cart ${cart.id} already exists in database. Skipping.`);
        // Optionally, update existing cart details if needed
      }
    }
  } catch (error) {
    console.error('Failed to fetch or process abandoned carts:', error);
  }
}