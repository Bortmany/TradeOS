"use client";

// ScreenshotPicker — the "Screenshots" section of the trade editor. Up to 5
// pictures per trade in a 3-across grid with an Add tile. Pictures save straight
// away (upload and delete), not with "Save journal", and the typed text in the
// editor is never lost: the page refresh after a change keeps it.
//
// The pictures load through /api/attachments/[id], which only ever answers the
// owner. Nothing here is a public link.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Hint } from "@/components/hint";
import { DemoLine, ERROR_BANNER } from "@/components/checklist/api";

export const MAX_PER_TRADE = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;

const MSG_TYPE = "That file isn't a PNG, JPEG or WebP picture.";
const MSG_BIG = "That picture is over 5 MB.";
const MSG_FULL = `This trade already has ${MAX_PER_TRADE} screenshots.`;
const MSG_LIMIT = "You've reached your upload limit for now, try again in a few minutes.";
const MSG_NET = "Couldn't upload that picture. Check your connection and try again.";

interface Props {
  tradeId: string;
  /** For the picture descriptions, e.g. "MES long". */
  label: string;
  initialIds: string[];
  /** False when storage isn't set up: only a muted line shows. */
  enabled: boolean;
  demo: boolean;
}

interface Uploading {
  file: File;
  preview: string;
  pct: number;
}

type Outcome = { ok: true; id: string } | { ok: false; code: string; error: string };

function sendFile(
  tradeId: string,
  file: File,
  onProgress: (pct: number) => void,
  register: (abort: () => void) => void
): Promise<Outcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    register(() => xhr.abort());
    xhr.open("POST", `/api/trades/${encodeURIComponent(tradeId)}/attachments`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let body: { ok?: boolean; id?: string; code?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* fall through */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.ok && body.id) {
        resolve({ ok: true, id: body.id });
      } else if (xhr.status === 429) {
        resolve({ ok: false, code: "quota", error: MSG_LIMIT });
      } else {
        resolve({ ok: false, code: body.code ?? "network", error: body.error ?? MSG_NET });
      }
    };
    xhr.onerror = () => resolve({ ok: false, code: "network", error: MSG_NET });
    xhr.onabort = () => resolve({ ok: false, code: "aborted", error: "" });
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export function ScreenshotPicker({ tradeId, label, initialIds, enabled, demo }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const [ids, setIds] = useState<string[]>(initialIds);
  const [up, setUp] = useState<Uploading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    return () => {
      if (up) URL.revokeObjectURL(up.preview);
    };
  }, [up]);

  if (!enabled) {
    return (
      <div className="space-y-1.5">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Screenshots</p>
        <p className="text-sm text-muted-foreground">Screenshots aren&apos;t switched on yet.</p>
      </div>
    );
  }

  const full = ids.length >= MAX_PER_TRADE;
  const busy = up !== null;

  async function start(file: File) {
    setError(null);
    setRetryFile(null);
    setNotice(null);
    const typeOk = ALLOWED_TYPES.includes(file.type) || (!file.type && ALLOWED_EXT.test(file.name));
    if (!typeOk) return setError(MSG_TYPE);
    if (file.size > MAX_BYTES) return setError(MSG_BIG);
    if (ids.length >= MAX_PER_TRADE) return setError(MSG_FULL);

    const preview = URL.createObjectURL(file);
    setUp({ file, preview, pct: 0 });
    setAnnounce("Uploading, 0 percent");
    let lastSaid = 0;
    const result = await sendFile(
      tradeId,
      file,
      (pct) => {
        setUp((u) => (u ? { ...u, pct } : u));
        if (pct >= lastSaid + 25) {
          lastSaid = pct - (pct % 25);
          setAnnounce(`Uploading, ${lastSaid} percent`);
        }
      },
      (abort) => {
        abortRef.current = abort;
      }
    );
    abortRef.current = null;
    URL.revokeObjectURL(preview);
    setUp(null);

    if (result.ok) {
      setIds((cur) => [...cur, result.id]);
      setNotice("Screenshot added.");
      router.refresh(); // the Rule Evaluations card re-reads; typed text stays
      return;
    }
    if (result.code === "aborted") return;
    setError(result.error);
    if (result.code === "network") setRetryFile(file);
  }

  function onChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still fires
    if (file) void start(file);
  }

  function openPicker() {
    if (demo) return setShowDemo(true);
    inputRef.current?.click();
  }

  async function remove(id: string) {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error("failed");
      setIds((cur) => cur.filter((x) => x !== id));
      setConfirmId(null);
      setViewer(null);
      setNotice("Screenshot deleted.");
      router.refresh();
    } catch {
      setConfirmId(null);
      setError("Couldn't delete that picture. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Screenshots</p>
        <p className="text-2xs tabular text-muted-foreground">
          {ids.length} of {MAX_PER_TRADE}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ids.map((id, i) => (
          <Tile
            key={id}
            id={id}
            alt={`Screenshot ${i + 1} of ${ids.length} for ${label}`}
            n={i + 1}
            onOpen={() => setViewer(i)}
            onDelete={() => setConfirmId(id)}
          />
        ))}

        {up && (
          <div className="relative aspect-square overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={up.preview} alt="" className="h-full w-full object-cover opacity-60" />
            <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-background/90 to-transparent px-2 pb-2 pt-6">
              <p className="text-2xs tabular text-foreground">{up.pct}%</p>
              <Progress value={up.pct} className="h-1" />
            </div>
            <Hint label="Cancel upload">
              <button
                type="button"
                aria-label="Cancel upload"
                onClick={() => abortRef.current?.()}
                className="absolute end-0 top-0 flex h-10 w-10 items-start justify-end p-1"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/80 text-foreground">
                  <X className="h-3.5 w-3.5" />
                </span>
              </button>
            </Hint>
          </div>
        )}

        {!full && (
          <Hint label="Add a screenshot (PNG, JPEG or WebP, up to 5 MB)">
            <button
              type="button"
              aria-label="Add screenshot"
              disabled={busy}
              onClick={openPicker}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-surface-raised text-muted-foreground transition-colors hover:border-primary/40 active:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              <span className="text-xs">Add</span>
            </button>
          </Hint>
        )}

        {ids.length === 0 && !up && (
          <p className="col-span-2 flex items-center text-sm text-muted-foreground">
            A picture of the chart now is worth a hundred words later. Add the entry screenshot.
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onChosen}
        tabIndex={-1}
        aria-hidden="true"
      />

      {full && (
        <p className="text-xs text-muted-foreground">
          {MSG_FULL} Delete one to add another.
        </p>
      )}

      {error && (
        <div className={`${ERROR_BANNER} flex flex-wrap items-center justify-between gap-2`} role="alert">
          <span>{error}</span>
          {retryFile && (
            <Button type="button" variant="secondary" size="sm" onClick={() => void start(retryFile)}>
              Try again
            </Button>
          )}
        </div>
      )}
      {showDemo && <DemoLine />}

      <p role="status" aria-live="polite" className="flex min-h-[1rem] items-center gap-1.5 text-xs text-muted-foreground">
        {notice && (
          <>
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>{notice}</span>
          </>
        )}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <p className="text-2xs text-muted-foreground">
        Only you can open these. Phone photos have their hidden location data removed before saving.
        Screenshots can show account numbers or balances, so crop out anything you don&apos;t want
        stored.
      </p>

      <Viewer
        ids={ids}
        index={viewer}
        label={label}
        onIndex={setViewer}
        onDelete={(id) => setConfirmId(id)}
      />

      <Dialog open={confirmId !== null} onOpenChange={(o) => !o && !deleting && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this screenshot?</DialogTitle>
            <DialogDescription>
              It&apos;s removed for good, including from our storage. Your trade stays. If one of your
              rules asks for a screenshot, this trade is checked again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => confirmId && void remove(confirmId)}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? "Deleting…" : "Delete screenshot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({
  id,
  alt,
  n,
  onOpen,
  onDelete,
}: {
  id: string;
  alt: string;
  n: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-square">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open screenshot ${n}`}
        className="block h-full w-full overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {!loaded && !failed && <Skeleton className="absolute inset-0 rounded-lg" />}
        {failed ? (
          <span className="flex h-full items-center justify-center bg-surface-raised px-1 text-2xs text-muted-foreground">
            Couldn&apos;t load
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/attachments/${id}`}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </button>
      <Hint label="Delete this screenshot">
        <button
          type="button"
          aria-label={`Delete screenshot ${n}`}
          onClick={onDelete}
          className="absolute end-0 top-0 flex h-10 w-10 items-start justify-end p-1"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/80 text-foreground">
            <X className="h-3.5 w-3.5" />
          </span>
        </button>
      </Hint>
    </div>
  );
}

function Viewer({
  ids,
  index,
  label,
  onIndex,
  onDelete,
}: {
  ids: string[];
  index: number | null;
  label: string;
  onIndex: (i: number | null) => void;
  onDelete: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const open = index !== null && index < ids.length;
  const id = open ? ids[index as number] : null;

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [id, attempt]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") onIndex(Math.min(ids.length - 1, (index as number) + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, (index as number) - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, ids.length, onIndex]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="max-w-[calc(100vw-16px)] md:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Screenshot {open ? (index as number) + 1 : 0} of {ids.length}
          </DialogTitle>
          <DialogDescription className="sr-only">Full-size screenshot for {label}</DialogDescription>
        </DialogHeader>
        {id && (
          <div className="flex justify-center">
            {failed ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-surface-raised text-sm text-muted-foreground">
                Couldn&apos;t load this picture.
                <Button variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                {!loaded && <Skeleton className="aspect-video w-full" />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${id}-${attempt}`}
                  src={`/api/attachments/${id}${attempt ? `?r=${attempt}` : ""}`}
                  alt={`Screenshot ${(index as number) + 1} of ${ids.length} for ${label}`}
                  onLoad={() => setLoaded(true)}
                  onError={() => setFailed(true)}
                  className={loaded ? "max-h-[70vh] w-auto max-w-full object-contain md:max-h-[75vh]" : "hidden"}
                />
              </>
            )}
          </div>
        )}
        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex gap-2">
            {ids.length > 1 && (
              <>
                <Hint label="Previous screenshot">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Previous screenshot"
                    disabled={!open || (index as number) === 0}
                    onClick={() => onIndex(Math.max(0, (index as number) - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </Hint>
                <Hint label="Next screenshot">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Next screenshot"
                    disabled={!open || (index as number) >= ids.length - 1}
                    onClick={() => onIndex(Math.min(ids.length - 1, (index as number) + 1))}
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </Hint>
              </>
            )}
          </div>
          <Hint label="Delete this screenshot">
            <Button
              variant="ghost"
              className="text-loss hover:bg-loss-muted hover:text-loss"
              onClick={() => id && onDelete(id)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </Hint>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
