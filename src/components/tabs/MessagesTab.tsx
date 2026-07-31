import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { editTeamMessage, fetchTeamMessages, postTeamMessage } from '../../services/messages';
import type { TeamMessage, TeamMessageBoard } from '../../types';
import './MessagesTab.css';

const MAX_LENGTH = 2000;
/** How often an open board checks for other people's notices. */
const POLL_INTERVAL_MS = 25_000;

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

  const [board, setBoard] = useState<TeamMessageBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(false);

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
    fetchTeamMessages(profile)
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
  }, [profile]);

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
      const next = await fetchTeamMessages(profile);
      const grew = next.messages.length > countRef.current;
      setBoard(next);
      setError(false);
      if (grew && atNewest) setScrollTick((tick) => tick + 1);
    } catch {
      // Keep showing the last good board; the next tick can recover.
    } finally {
      refreshingRef.current = false;
    }
  }, [profile]);

  // Composing or editing pauses the poll so nothing shifts under the writer.
  const paused = sending || savingEdit || editingId !== null;

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

  const upsert = (message: TeamMessage) =>
    setBoard((current) => {
      if (!current) return current;
      // Edits replace in place; a new post is the newest, so it goes last.
      const known = current.messages.some((m) => m.id === message.id);
      return {
        ...current,
        messages: known
          ? current.messages.map((m) => (m.id === message.id ? message : m))
          : [...current.messages, message],
      };
    });

  const handleSend = async () => {
    const text = draft.trim();
    if (!profile || !text) return;
    setSending(true);
    setSendError(false);
    try {
      upsert(await postTeamMessage(profile, text));
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

  const startEdit = (message: TeamMessage) => {
    setEditingId(message.id);
    setEditedText(message.text);
    setEditError(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(false);
  };

  const handleSaveEdit = async (message: TeamMessage) => {
    const text = editedText.trim();
    if (!profile || !text || text === message.text) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    setEditError(false);
    try {
      upsert(await editTeamMessage(profile, message.id, text));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to edit message', err);
      setEditError(true);
    } finally {
      setSavingEdit(false);
    }
  };

  const roleLabel = (role: number) => t(`contacts.roles.${role}`, { defaultValue: '' });

  return (
    <section
      ref={sectionRef}
      className={board?.canPost ? 'messages-tab has-composer' : 'messages-tab'}
      role="tabpanel"
    >
      <h2 className="tab-title">{t('messages.heading')}</h2>

      {messages.map((m) => {
        const mine = m.senderId === profile?.id;
        const isEditing = editingId === m.id;
        const role = roleLabel(m.senderRole);
        return (
          <article className="card msg-card" key={m.id}>
            <div className="msg-head">
              <div className="msg-sender">
                <strong>{m.senderName}</strong>
                {role && <span className="tl-badge">{role}</span>}
              </div>
              {mine && !isEditing && (
                <button className="btn-edit" onClick={() => startEdit(m)}>
                  {t('common.edit')}
                </button>
              )}
            </div>

            <div className="msg-time">
              {timeFmt.format(new Date(m.createdAt))}
              {m.updatedAt && ` · ${t('messages.edited')}`}
            </div>

            {isEditing ? (
              <>
                <textarea
                  className="msg-textarea"
                  aria-label={t('messages.composerLabel')}
                  value={editedText}
                  maxLength={MAX_LENGTH}
                  rows={3}
                  disabled={savingEdit}
                  onChange={(e) => setEditedText(e.target.value)}
                  autoFocus
                />
                {editError && (
                  <p className="error-text" role="alert">
                    {t('messages.saveFailed')}
                  </p>
                )}
                <div className="msg-edit-actions">
                  <button
                    className="btn-save"
                    onClick={() => handleSaveEdit(m)}
                    disabled={savingEdit}
                  >
                    {savingEdit ? t('common.saving') : t('common.save')}
                  </button>
                  <button className="btn-cancel" onClick={cancelEdit} disabled={savingEdit}>
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <p className="msg-text">{m.text}</p>
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
          {board?.teamCode ? t('messages.empty') : t('messages.noTeam')}
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
              placeholder={t('messages.placeholder')}
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
