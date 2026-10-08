import { ChatConversation, ChatMessage, Listing } from '../types';
import {
  chatApi,
  DealBrizChatMessage,
  DealBrizConversationRow,
} from './dealbrizApi';
import { defaultListingImage, initialsAvatar } from '../utils/imageUtils';

/**
 * Bridges the app's ChatConversation shape onto the real buyer↔seller
 * endpoints documented in Section 3.7 of the API docs.
 *
 * Messages are stored server-side against (product_id, sender_id, receiver_id),
 * so a message sent here shows up on the other person's device. Nothing in this
 * file generates replies - the previous build answered the buyer with a
 * canned "seller" message that never left the phone.
 */

/** Thread id used by the client: product and counterparty together. */
export function threadId(productId: string, otherUserId: string): string {
  return `${productId}::${otherUserId}`;
}

export function parseThreadId(id: string): { productId: string; otherUserId: string } | null {
  const parts = id.split('::');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { productId: parts[0], otherUserId: parts[1] };
}

/**
 * The API returns naive timestamps - "2026-08-01T09:00:00" with no offset.
 * JavaScript reads a date-time string without an offset as LOCAL time, so a
 * UTC value from the server came out 5h30m early on an IST device. Tag it as
 * UTC so the browser converts it to the viewer's own zone.
 */
export function parseServerDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso.trim());
  return new Date(hasZone ? iso : `${iso.trim().replace(' ', 'T')}Z`);
}

function formatTime(iso: string): string {
  const d = parseServerDate(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** An offer message is just a normal message with a recognisable prefix. */
const OFFER_PREFIX = '[offer]';

export function encodeOffer(amount: number, text: string): string {
  return `${OFFER_PREFIX}${amount}|${text}`;
}

function decodeMessageBody(body: string): { text: string; offerAmount?: number } {
  if (!body.startsWith(OFFER_PREFIX)) return { text: body };
  const rest = body.slice(OFFER_PREFIX.length);
  const sep = rest.indexOf('|');
  if (sep === -1) return { text: rest };
  const amount = Number(rest.slice(0, sep));
  return {
    text: rest.slice(sep + 1),
    offerAmount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
  };
}

export function mapApiMessage(msg: DealBrizChatMessage, myUserId: string): ChatMessage {
  const decoded = decodeMessageBody(msg.body || '');
  return {
    id: String(msg.id),
    // 'user' means "me"; 'seller' means the other party, whichever role I hold.
    sender: String(msg.sender_id) === String(myUserId) ? 'user' : 'seller',
    text: decoded.text,
    timestamp: formatTime(msg.created_at),
    isOffer: decoded.offerAmount !== undefined,
    offerAmount: decoded.offerAmount,
  };
}

/** Builds a thread for a listing the user is about to message about. */
export function conversationForListing(
  listing: Listing,
  otherUserId: string,
  existing?: ChatConversation
): ChatConversation {
  return {
    id: threadId(listing.id, otherUserId),
    listingId: listing.id,
    otherUserId,
    listingTitle: listing.title,
    listingPrice: listing.price,
    listingImage: listing.image_url || defaultListingImage(listing.title, listing.category),
    sellerName: listing.seller_name || 'DealBriz Seller',
    sellerAvatar: listing.seller_avatar || initialsAvatar(listing.seller_name || 'Seller'),
    sellerPhone: listing.seller_phone,
    messages: existing?.messages || [],
    unreadCount: 0,
    lastUpdated: existing?.lastUpdated || new Date().toISOString(),
  };
}

/** Maps the server's conversation list into the app's inbox shape. */
export function mapConversationRow(
  row: DealBrizConversationRow,
  listings: Listing[],
  myUserId: string
): ChatConversation {
  const listing = listings.find((l) => l.id === String(row.product_id));
  const decoded = decodeMessageBody(row.body || '');

  return {
    id: threadId(String(row.product_id), String(row.other_user_id)),
    listingId: String(row.product_id),
    otherUserId: String(row.other_user_id),
    listingTitle: row.product_title || listing?.title || 'Listing',
    listingPrice: listing?.price || 0,
    listingImage:
      listing?.image_url || defaultListingImage(row.product_title || 'Listing', listing?.category),
    sellerName: row.other_user_name || 'DealBriz User',
    sellerAvatar: row.other_user_avatar || initialsAvatar(row.other_user_name || 'User'),
    sellerPhone: listing?.seller_phone,
    // Sent by the server only when the other user switched "show my number"
    // on in their Profile; otherwise null.
    otherUserPhone: row.other_user_phone || undefined,
    messages: [
      {
        id: `preview-${row.product_id}-${row.other_user_id}`,
        sender: 'seller',
        text: decoded.text,
        timestamp: formatTime(row.created_at),
      },
    ],
    // The row is the thread's latest message. Its is_read flag says whether
    // the RECEIVER has read it - so when that message is one I sent, it means
    // "the other person hasn't read it yet", not "I have something unread".
    // Treating it as mine is what kept a dot on every chat I'd replied in.
    unreadCount: String(row.receiver_id) === String(myUserId) && !row.is_read ? 1 : 0,
    lastUpdated: row.created_at,
  };
}

/** Loads the signed-in user's inbox. */
export async function loadInbox(
  listings: Listing[],
  myUserId: string
): Promise<ChatConversation[]> {
  const rows = await chatApi.getMyConversations();
  return rows
    .map((row) => mapConversationRow(row, listings, myUserId))
    .sort(
      (a, b) => parseServerDate(b.lastUpdated).getTime() - parseServerDate(a.lastUpdated).getTime()
    );
}

/** Loads one thread's full history. */
export async function loadThreadMessages(
  productId: string,
  otherUserId: string,
  myUserId: string
): Promise<ChatMessage[]> {
  const msgs = await chatApi.getConversationMessages(productId, otherUserId);
  return (msgs || []).map((m) => mapApiMessage(m, myUserId));
}

/** Sends a message to the other party's account. */
export async function sendThreadMessage(
  productId: string,
  receiverId: string,
  text: string,
  offerAmount?: number
): Promise<void> {
  await chatApi.sendMessage({
    productId,
    receiverId,
    body: offerAmount ? encodeOffer(offerAmount, text) : text,
  });
}

export async function markThreadRead(productId: string, otherUserId: string): Promise<void> {
  await chatApi.markMessagesRead(productId, otherUserId);
}
