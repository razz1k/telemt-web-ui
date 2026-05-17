import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import type { UserInfo } from "../lib/types";
import {
  formatIpBadge,
  formatUserTraffic,
  userRowHighlightClass,
  userStatusDotClass,
  fromDatetimeLocalValue,
  limitToInput,
  parseLimitInput,
  parseQuotaGbInput,
  pickProxyLink,
  quotaGbToInput,
  userSecret,
  toDatetimeLocalValue,
} from "../lib/users";

export interface UserDraft {
  maxTcp: string;
  maxIps: string;
  quotaGb: string;
  expire: string;
}

interface UserTableRowProps {
  user: UserInfo;
  onPatch: (username: string, body: Record<string, unknown>) => Promise<void>;
  onRotate: (username: string) => Promise<string | undefined>;
  onDelete: (username: string) => void;
  onResetQuota: (username: string) => void;
  busy?: boolean;
}

export function UserTableRow({
  user,
  onPatch,
  onRotate,
  onDelete,
  onResetQuota,
  busy,
}: UserTableRowProps) {
  const [draft, setDraft] = useState<UserDraft>(() => rowToDraft(user));
  const [revealedSecret, setRevealedSecret] = useState(() => userSecret(user) ?? "");
  const [secretEdited, setSecretEdited] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const link = pickProxyLink(user);

  useEffect(() => {
    setDraft(rowToDraft(user));
    if (!secretEdited) {
      setRevealedSecret(userSecret(user) ?? "");
    }
  }, [user, secretEdited]);

  const traffic = formatUserTraffic(user);
  const rowClass = userRowHighlightClass(user);

  async function saveField(patch: Record<string, unknown>) {
    await onPatch(user.username, patch);
  }

  return (
    <tr className={`border-b border-surface-border/60 align-top ${rowClass}`}>
      <td className="py-3 pr-2 font-medium text-gray-200 whitespace-nowrap">
        {user.username}
      </td>
      <td className="py-3 pr-2 min-w-[200px]">
        <input
          className="ui-input w-full font-mono text-xs"
          value={revealedSecret}
          placeholder="32 hex chars"
          maxLength={32}
          disabled={busy}
          onChange={(e) => {
            setRevealedSecret(e.target.value);
            setSecretEdited(true);
          }}
          onBlur={async () => {
            if (/^[0-9a-fA-F]{32}$/.test(revealedSecret)) {
              await saveField({ secret: revealedSecret });
            }
          }}
        />
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            className="ui-btn ui-btn-blue text-xs"
            disabled={busy}
            onClick={async () => {
              const secret = await onRotate(user.username);
              if (secret) {
                setRevealedSecret(secret);
                setSecretEdited(true);
              }
            }}
          >
            Gen
          </button>
        </div>
      </td>
      <td className="py-3 pr-2">
        <input
          className="ui-input w-24 text-xs"
          value={draft.maxTcp}
          placeholder="unlimited"
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, maxTcp: e.target.value })}
          onBlur={async () => {
            const v = parseLimitInput(draft.maxTcp);
            if (v !== undefined) await saveField({ max_tcp_conns: v });
          }}
        />
      </td>
      <td className="py-3 pr-2">
        <input
          className="ui-input w-20 text-xs"
          value={draft.maxIps}
          placeholder="unlimited"
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, maxIps: e.target.value })}
          onBlur={async () => {
            const v = parseLimitInput(draft.maxIps);
            if (v !== undefined) await saveField({ max_unique_ips: v });
          }}
        />
      </td>
      <td className="py-3 pr-2">
        <input
          className="ui-input w-24 text-xs"
          value={draft.quotaGb}
          placeholder="unlimited"
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, quotaGb: e.target.value })}
          onBlur={async () => {
            const v = parseQuotaGbInput(draft.quotaGb);
            if (v !== undefined) await saveField({ data_quota_bytes: v });
          }}
        />
      </td>
      <td className="py-3 pr-2">
        <input
          type="datetime-local"
          className="ui-input w-44 text-xs"
          value={draft.expire}
          placeholder="no expiry"
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, expire: e.target.value })}
          onBlur={async () => {
            await saveField({
              expiration_rfc3339: fromDatetimeLocalValue(draft.expire),
            });
          }}
        />
      </td>
      <td className="py-3 pr-2 text-xs text-gray-400 min-w-[140px]">
        <div className="flex items-center gap-1">
          <span title="Download">↓</span>
          <span>{traffic.down}</span>
        </div>
        <div className="flex items-center gap-1">
          <span title="Upload">↑</span>
          <span>{traffic.up}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${userStatusDotClass(user)}`}
          />
          <span>{formatIpBadge(user)}</span>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-ghost text-xs mt-1"
          onClick={() => onResetQuota(user.username)}
        >
          Reset stats
        </button>
      </td>
      <td className="py-3 pr-2 min-w-[220px]">
        <input
          className="ui-input w-full text-xs font-mono"
          readOnly
          value={link}
          placeholder="tg://proxy?…"
        />
        <div className="flex gap-1 mt-1 flex-wrap">
          <button
            type="button"
            className="ui-btn ui-btn-blue text-xs"
            disabled={!link}
            onClick={() => void navigator.clipboard.writeText(link)}
          >
            Copy
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost text-xs"
            disabled={!link}
            onClick={() => setShowQr((v) => !v)}
          >
            QR
          </button>
        </div>
        {showQr && link ? (
          <div className="mt-2 inline-block p-2 bg-white rounded">
            <QRCodeSVG value={link} size={120} />
          </div>
        ) : null}
      </td>
      <td className="py-3">
        <button
          type="button"
          className="ui-btn ui-btn-red text-xs whitespace-nowrap"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete user ${user.username}?`)) {
              onDelete(user.username);
            }
          }}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function rowToDraft(user: UserInfo): UserDraft {
  return {
    maxTcp: limitToInput(user.max_tcp_conns),
    maxIps: limitToInput(user.max_unique_ips),
    quotaGb: quotaGbToInput(user.data_quota_bytes),
    expire: toDatetimeLocalValue(user.expiration_rfc3339),
  };
}
