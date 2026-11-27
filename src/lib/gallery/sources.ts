export type GallerySource = {
  slug: string;
  name: string;
  sourceUrl: string;
  description: string;
  note: string;
  /** Exact paths to keep. Omit to keep the whole document. */
  paths?: string[];
  tasks: string[];
};

export const GALLERY_SOURCES: GallerySource[] = [
  {
    slug: "petstore",
    name: "Swagger Petstore",
    sourceUrl: "https://petstore3.swagger.io/api/v3/openapi.json",
    description: "The official OpenAPI 3 demo shop. Small enough to run whole.",
    note: "Official Swagger Petstore 3.0 spec, kept in full.",
    tasks: [
      "Add a pet named DemoDog with status available, then fetch that pet by its id.",
      "Find pets whose status is available.",
      "Place an order for a pet, then fetch that order by its id.",
      "Add a pet named TempPet, then delete that pet.",
    ],
  },
  {
    slug: "github",
    name: "GitHub REST",
    sourceUrl:
      "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    description: "Issues, repositories, and the authenticated user from GitHub's public REST spec.",
    note: "Trimmed from the official GitHub REST OpenAPI to the authenticated user, repositories, and issues. The full spec has hundreds of paths.",
    paths: [
      "/user",
      "/user/repos",
      "/repos/{owner}/{repo}",
      "/repos/{owner}/{repo}/issues",
      "/repos/{owner}/{repo}/issues/{issue_number}",
      "/repos/{owner}/{repo}/issues/{issue_number}/comments",
    ],
    tasks: [
      "Get the authenticated user.",
      "Create an issue titled \"APIProof check\" on owner octocat and repo hello-world, then fetch that issue by its number.",
      "List issues for owner octocat and repo hello-world.",
      "Add a comment with the text \"Looks good\" on the issue you created.",
    ],
  },
  {
    slug: "stripe",
    name: "Stripe",
    sourceUrl: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    description: "Customers, products, prices, and invoices from Stripe's public OpenAPI spec.",
    note: "Trimmed from Stripe's official OpenAPI to customers, products, prices, and invoices. The full spec is much larger.",
    paths: [
      "/v1/customers",
      "/v1/customers/{customer}",
      "/v1/products",
      "/v1/products/{id}",
      "/v1/prices",
      "/v1/prices/{price}",
      "/v1/invoices",
      "/v1/invoices/{invoice}",
    ],
    tasks: [
      "Create a customer named Ada with email ada@example.com, then fetch that customer by id.",
      "Create a product named APIProof.",
      "Create an invoice for the customer you created, then fetch that invoice by its id.",
      "List customers.",
    ],
  },
  {
    slug: "openai",
    name: "OpenAI",
    sourceUrl: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml",
    description: "Models and chat completions from OpenAI's public OpenAPI document.",
    note: "Trimmed from the official OpenAI OpenAPI document to models, chat completions, and embeddings.",
    paths: ["/models", "/models/{model}", "/chat/completions", "/embeddings"],
    tasks: [
      "List the available models.",
      "Fetch a model by an id returned from the model list.",
      "Create a chat completion with a user message \"Say hello\".",
    ],
  },
  {
    slug: "twilio",
    name: "Twilio",
    sourceUrl: "https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json",
    description: "Messages from Twilio's public 2010 REST spec.",
    note: "Trimmed from Twilio's official API 2010 OpenAPI to account messages and the call list.",
    paths: [
      "/2010-04-01/Accounts/{AccountSid}/Messages.json",
      "/2010-04-01/Accounts/{AccountSid}/Messages/{Sid}.json",
      "/2010-04-01/Accounts/{AccountSid}/Calls.json",
    ],
    tasks: [
      "Send an SMS with the body \"APIProof ping\" on account AC00000000000000000000000000000001, then fetch that message by its sid.",
      "List messages on account AC00000000000000000000000000000001.",
      "Send an SMS with the body \"APIProof follow-up\" on account AC00000000000000000000000000000001.",
    ],
  },
  {
    slug: "spotify",
    name: "Spotify",
    sourceUrl: "https://developer.spotify.com/reference/web-api/open-api-schema.yaml",
    description: "Search, tracks, and playlists from Spotify's published Web API schema.",
    note: "Trimmed from Spotify's published Web API OpenAPI schema to search, tracks, the current user, and playlists.",
    paths: [
      "/search",
      "/tracks/{id}",
      "/me",
      "/me/playlists",
      "/playlists/{playlist_id}",
      "/playlists/{playlist_id}/tracks",
      "/users/{user_id}/playlists",
    ],
    tasks: [
      "Search tracks for the query \"Bohemian Rhapsody\".",
      "Fetch a track by the id returned from that search.",
      "Create a playlist named APIProof for the current user, then add a track to that playlist.",
    ],
  },
  {
    slug: "digitalocean",
    name: "DigitalOcean",
    sourceUrl: "https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml",
    description: "Droplets and the account endpoint from DigitalOcean's public API spec.",
    note: "Trimmed from DigitalOcean's official public OpenAPI to droplets and the account endpoint.",
    paths: ["/v2/droplets", "/v2/droplets/{droplet_id}", "/v2/account"],
    tasks: [
      "List droplets.",
      "Create a droplet named api-proof-demo, then fetch that droplet by its id.",
      "Get the account.",
      "Delete the droplet you created.",
    ],
  },
  {
    slug: "slack",
    name: "Slack Web API",
    sourceUrl: "https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json",
    description: "A small slice of Slack's public Web API spec, which is still Swagger 2.0.",
    note: "Trimmed from Slack's public Web API spec and converted from Swagger 2.0 when a run starts. Kept methods: post a message, update a message, list conversations, create a conversation, search messages.",
    paths: ["/chat.postMessage", "/chat.update", "/conversations.list", "/conversations.create", "/search.messages"],
    tasks: [
      "Post a message to channel C012345 with the text \"APIProof ping\".",
      "List conversations.",
      "Search messages for the query \"APIProof\".",
      "Update a chat message.",
    ],
  },
  {
    slug: "razorpay",
    name: "Razorpay",
    sourceUrl: "https://raw.githubusercontent.com/mehuled/razorpay-go/master/api/swagger.yaml",
    description: "Orders and payments from a public community OpenAPI for Razorpay's documented API.",
    note: "Razorpay does not publish an official OpenAPI file at a stable URL. This subset comes from the public community document at github.com/mehuled/razorpay-go and only includes create-order and list-payments. It is not an official Razorpay spec.",
    tasks: [
      "Create an order for amount 50000 and currency INR with receipt \"api-proof\".",
      "Create an order for amount 125000 and currency INR with receipt \"api-proof-followup\".",
      "List all payments.",
    ],
  },
];
