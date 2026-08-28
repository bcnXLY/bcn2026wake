import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { deleteTeamMessage, fetchTeamMessages, postTeamMessage } from '../../services/messages';
import type { MessageScope, TeamMessage, TeamMessageBoard } from '../../types';
import { linkify } from '../../utils/linkify';
import './MessagesTab.css';

const MAX_LENGTH = 2000;
/** How often an open board checks for other people's notices. */
const POLL_INTERVAL_MS = 25_000;

/** Every board reads the same way; only the audience it names changes. */
const BOARD_COPY: Record<
  MessageScope,
  { heading: string; tab: string; placeholder: string; empty: string; unassigned?: string }
> = {
  team: {
    heading: 'messages.heading',
    tab: 'messages.tabTeam',
    placeholder: 'messages.placeholder',
    empty: 'messages.empty',
    unassigned: 'messages.noTeam',
  },
  room: {
    heading: 'messages.roomHeading',
    tab: 'messages.tabRoom',
    placeholder: 'messages.roomPlaceholder',
    empty: 'messages.roomEmpty',
    unassigned: 'messages.noRoom',
  },
  global: {
    heading: 'messages.globalHeading',
    tab: 'messages.tabGlobal',
    placeholder: 'messages.globalPlaceholder',
    empty: 'messages.globalEmpty',
  },
};

/** Tab order, narrowest audience first. */
const SCOPES: MessageScope[] = ['team', 'room', 'global'];

/**
 * The element that actually scrolls the board. Depending on how tall the shell
 * is, that is either the body pane or the page itself.
 */
function scrollParentOf(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

const SEND_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 2 11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

export default function MessagesTab() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const [scope, setScope] = useState<MessageScope>('team');
  const [board, setBoard] = useState<TeamMessageBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  // Bumped whenever the newest message should come into view (first load, own post).
  const [scrollTick, setScrollTick] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const countRef = useRef(0);
  const refreshingRef = useRef(false);

  const load = useCallback(() => {
    if (!profile) return () => {};
    let active = true;
    setLoading(true);
    setError(false);
    fetchTeamMessages(profile, scope)
      .then((b) => {
        if (!active) return;
        setBoard(b);
        setScrollTick((tick) => tick + 1);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [profile, scope]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    countRef.current = board?.messages.length ?? 0;
  }, [board]);

  /** Background poll: no spinner, and a failure leaves the board as it is. */
  const refresh = useCallback(async () => {
    if (!profile || refreshingRef.current) return;
    refreshingRef.current = true;

    const scroller = scrollParentOf(sectionRef.current);
    // Only follow new arrivals if the reader is already at the newest message.
    const atNewest =
      !scroller || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 80;

    try {
      const next = await fetchTeamMessages(profile, scope);
      const grew = next.messages.length > countRef.current;
      setBoard(next);
      setError(false);
      if (grew && atNewest) setScrollTick((tick) => tick + 1);
    } catch {
      // Keep showing the last good board; the next tick can recover.
    } finally {
      refreshingRef.current = false;
    }
  }, [profile, scope]);

  // Composing or confirming a delete pauses the poll so nothing shifts under the writer.
  const paused = sending || deleting || confirmingId !== null;

  useEffect(() => {
    if (paused) return;
    const refreshIfVisible = () => {
      if (!document.hidden) void refresh();
    };
    const id = setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [paused, refresh]);


  useEffect(() => {
    if (scrollTick === 0) return;
    const scroller = scrollParentOf(sectionRef.current);
    scroller?.scrollTo({
      top: scroller.scrollHeight,
      behavior: scrollTick === 1 ? 'auto' : 'smooth',
    });
  }, [scrollTick]);

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.resolvedLanguage],
  );

  // Oldest at the top, newest at the bottom — the board reads like a chat.
  const messages = board?.messages ?? [];

  /** A new post is the newest, so it goes last — unless a poll already picked it up. */
  const append = (message: TeamMessage) =>
    setBoard((current) => {
      if (!current || current.messages.some((m) => m.id === message.id)) return current;
      return { ...current, messages: [...current.messages, message] };
    });

  const drop = (messageId: string) =>
    setBoard((current) =>
      current
        ? { ...current, messages: current.messages.filter((m) => m.id !== messageId) }
        : current,
    );

  const handleSend = async () => {
    const text = draft.trim();
    if (!profile || !text) return;
    setSending(true);
    setSendError(false);
    try {
      append(await postTeamMessage(profile, text, scope));
      setDraft('');
      setScrollTick((tick) => tick + 1);
    } catch (err) {
      console.error('Failed to post message', err);
      // Keep the draft so a failed send isn't lost.
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  const startDelete = (message: TeamMessage) => {
    setConfirmingId(message.id);
    setDeleteError(false);
  };

  const cancelDelete = () => {
    setConfirmingId(null);
    setDeleteError(false);
  };

  const handleDelete = async (message: TeamMessage) => {
    if (!profile) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteTeamMessage(profile, message.id, scope);
      drop(message.id);
      setConfirmingId(null);
    } catch (err) {
      console.error('Failed to delete message', err);
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  const roleLabel = (role: number) => t(`contacts.roles.${role}`, { defaultValue: '' });

  const switchScope = (next: MessageScope) => {
    if (next === scope) return;
    setScope(next);
    setBoard(null);
    setDraft('');
    setConfirmingId(null);
    setSendError(false);
  };

  const copy = BOARD_COPY[scope];

  return (
    <section
      ref={sectionRef}
      className={board?.canPost ? 'messages-tab has-composer' : 'messages-tab'}
      role="tabpanel"
    >
      <div className="msg-topbar">
        <h2 className="tab-title">{t(copy.heading)}</h2>
        <div className="msg-switch" role="tablist" aria-label={t('nav.messages')}>
          {SCOPES.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={scope === key}
              className={scope === key ? 'msg-switch-btn is-on' : 'msg-switch-btn'}
              onClick={() => switchScope(key)}
            >
              {t(BOARD_COPY[key].tab)}
            </button>
          ))}
        </div>
      </div>

      {messages.map((m) => {
        const mine = m.senderId === profile?.id;
        const confirming = confirmingId === m.id;
        const role = roleLabel(m.senderRole);
        return (
          <article className="card msg-card" key={m.id}>
            <div className="msg-head">
              <div className="msg-sender">
                <strong>{m.senderName}</strong>
                {role && <span className="tl-badge">{role}</span>}
              </div>
              {mine && !confirming && (
                <button className="btn-delete" onClick={() => startDelete(m)}>
                  {t('common.delete')}
                </button>
              )}
            </div>

            <div className="msg-time">{timeFmt.format(new Date(m.createdAt))}</div>

            <p className="msg-text">
              {linkify(m.text).map((part, i) =>
                part.href ? (
                  <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
                    {part.text}
                  </a>
                ) : (
                  part.text
                ),
              )}
            </p>

            {confirming && (
              <>
                <p className="msg-confirm">{t('messages.confirmDelete')}</p>
                {deleteError && (
                  <p className="error-text" role="alert">
                    {t('messages.deleteFailed')}
                  </p>
                )}
                <div className="msg-actions">
                  <button
                    className="btn-danger"
                    onClick={() => handleDelete(m)}
                    disabled={deleting}
                    autoFocus
                  >
                    {deleting ? t('messages.deleting') : t('common.delete')}
                  </button>
                  <button className="btn-cancel" onClick={cancelDelete} disabled={deleting}>
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}

      {loading ? (
        <div className="center-state">{t('common.loading')}</div>
      ) : error ? (
        <div className="center-state">
          <div>{t('messages.loadError')}</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : messages.length === 0 ? (
        <div className="center-state">
          {board?.teamCode ? t(copy.empty) : t(copy.unassigned ?? copy.empty)}
        </div>
      ) : null}

      {board?.canPost && (
        <div className="msg-composer">
          {sendError && (
            <p className="error-text" role="alert">
              {t('messages.sendFailed')}
            </p>
          )}
          <div className="msg-compose-row">
            <textarea
              className="msg-textarea"
              aria-label={t('messages.composerLabel')}
              placeholder={t(copy.placeholder)}
              value={draft}
              maxLength={MAX_LENGTH}
              rows={2}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              className="msg-send"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              aria-label={sending ? t('messages.sending') : t('messages.send')}
              title={t('messages.send')}
            >
              {sending ? <span className="spinner" /> : SEND_ICON}
            </button>
          </div>
        </div>
      )}

    </section>
  );
}
