use super::sync::changed_by;
use super::*;

impl Session {
    pub(super) async fn live_timeline(
        self: &Arc<Self>,
        room_id: &RoomId,
    ) -> Result<Arc<LiveTimeline>, String> {
        if let Some(existing) = self.touch_live(room_id).await {
            return Ok(existing);
        }
        // Built without holding the lock: the SDK may need the sync tasks, which also announce
        // rooms.
        let room = self.room(room_id.as_str())?;
        let timeline = Arc::new(
            room.timeline_builder()
                .track_read_marker_and_receipts(TimelineReadReceiptTracking::MessageLikeEvents)
                .build()
                .await
                .map_err(err)?,
        );
        let (mut items, stream) = timeline.subscribe().await;
        let session = self.clone();
        let id = room_id.to_owned();
        let task = tokio::spawn(async move {
            let mut readers = HashMap::new();
            let initial = items.iter().flat_map(|item| receipts_of(item));
            session.emit_receipts(&id, moved(&mut readers, initial));
            futures_util::pin_mut!(stream);
            while let Some(diffs) = stream.next().await {
                let mut receipts = Vec::new();
                for diff in diffs {
                    let changed = changed_by(&diff);
                    let carried = changed.iter().flat_map(|item| receipts_of(item));
                    receipts.extend(moved(&mut readers, carried));
                    // New or changed items only; bulk loads are what `messages` reads.
                    let fresh = match &diff {
                        VectorDiff::PushBack { value } => Some((value.clone(), None)),
                        VectorDiff::Set { index, value } => {
                            Some((value.clone(), items.get(*index).cloned()))
                        }
                        _ => None,
                    };
                    diff.apply(&mut items);
                    let Some((item, replaced)) = fresh else {
                        continue;
                    };
                    let Some(event) = to_mx_event(&id, &item) else {
                        continue;
                    };
                    // A receipt moving brings the same event again.
                    if replaced.and_then(|old| to_mx_event(&id, &old)).as_ref() == Some(&event) {
                        continue;
                    }
                    session
                        .latest_seen
                        .lock()
                        .unwrap()
                        .insert(id.clone(), event.preview.timestamp);
                    session.emit(MxUpdate::Event { event });
                }
                session.emit_receipts(&id, receipts);
            }
        });
        let (typing_guard, mut typing_rx) = room.subscribe_to_typing_notifications();
        let session = self.clone();
        let room_id_string = room_id.to_string();
        let typing_task = tokio::spawn(async move {
            while let Ok(ids) = typing_rx.recv().await {
                session.emit(MxUpdate::Typing {
                    room_id: room_id_string.clone(),
                    user_ids: ids.into_iter().map(|id| id.to_string()).collect(),
                });
            }
        });
        let entry = Arc::new(LiveTimeline {
            timeline,
            task,
            typing_task,
            _typing_guard: typing_guard,
        });

        let mut live = self.live.lock().await;
        if let Some(existing) = live
            .iter()
            .find(|(id, _)| id == room_id)
            .map(|(_, live)| live.clone())
        {
            entry.task.abort();
            entry.typing_task.abort();
            return Ok(existing);
        }
        live.push((room_id.to_owned(), entry.clone()));
        while live.len() > LIVE_TIMELINES {
            let (_, dropped) = live.remove(0);
            dropped.task.abort();
            dropped.typing_task.abort();
        }
        Ok(entry)
    }

    pub(super) async fn touch_live(&self, room_id: &RoomId) -> Option<Arc<LiveTimeline>> {
        let mut live = self.live.lock().await;
        let index = live.iter().position(|(id, _)| id == room_id)?;
        let entry = live.remove(index);
        let timeline = entry.1.clone();
        live.push(entry);
        Some(timeline)
    }

    pub(super) async fn messages(
        self: &Arc<Self>,
        room_id: &RoomId,
        limit: usize,
        before: Option<&str>,
    ) -> Result<Vec<MxEvent>, String> {
        let live = self.live_timeline(room_id).await?;
        let mut searched = 0;
        loop {
            let items = live.timeline.items().await;
            let Some(end) = anchor_end(&items, before) else {
                searched += 1;
                if searched > ANCHOR_SEARCH_PAGES
                    || live
                        .timeline
                        .paginate_backwards(HISTORY_PAGE)
                        .await
                        .map_err(err)?
                {
                    return Ok(Vec::new());
                }
                continue;
            };
            let page = page_before(room_id, &items, end, limit);
            if page.len() >= limit {
                return Ok(page);
            }
            let short = limit - page.len();
            let hit_start = live
                .timeline
                .paginate_backwards(HISTORY_PAGE.max(short as u16))
                .await
                .map_err(err)?;
            if hit_start {
                return Ok(page);
            }
        }
    }
}

/// Where the page ends: at the event `before` names, or after the newest item. `None` while
/// that event is not loaded yet.
fn anchor_end(items: &Vector<Arc<TimelineItem>>, before: Option<&str>) -> Option<usize> {
    let Some(id) = before else {
        return Some(items.len());
    };
    items.iter().position(|item| {
        item.as_event()
            .and_then(|e| e.event_id())
            .is_some_and(|e| e == id)
    })
}

/// The newest `limit` events before `end`, oldest first.
fn page_before(
    room_id: &RoomId,
    items: &Vector<Arc<TimelineItem>>,
    end: usize,
    limit: usize,
) -> Vec<MxEvent> {
    let mut page: Vec<MxEvent> = items
        .iter()
        .take(end)
        .rev()
        .filter_map(|item| to_mx_event(room_id, item))
        .take(limit)
        .collect();
    page.reverse();
    page
}

#[tauri::command]
pub async fn mx_messages(
    state: State<'_, Matrix>,
    room_id: String,
    limit: usize,
    before: Option<String>,
) -> Result<Vec<MxEvent>, String> {
    let session = current(&state)?;
    let room_id = RoomId::parse(&room_id).map_err(err)?;
    session.messages(&room_id, limit, before.as_deref()).await
}

#[tauri::command]
pub async fn mx_mark_read(state: State<'_, Matrix>, room_id: String) -> Result<(), String> {
    let session = current(&state)?;
    let room_id = RoomId::parse(&room_id).map_err(err)?;
    let live = session.live_timeline(&room_id).await?;
    live.timeline
        .mark_as_read(ReceiptType::Read)
        .await
        .map(|_| ())
        .map_err(err)
}

#[tauri::command]
pub async fn mx_set_marked_unread(
    state: State<'_, Matrix>,
    room_id: String,
    unread: bool,
) -> Result<(), String> {
    let session = current(&state)?;
    session
        .room(&room_id)?
        .set_unread_flag(unread)
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn mx_set_typing(
    state: State<'_, Matrix>,
    room_id: String,
    typing: bool,
) -> Result<(), String> {
    let session = current(&state)?;
    session
        .room(&room_id)?
        .typing_notice(typing)
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn mx_toggle_reaction(
    state: State<'_, Matrix>,
    room_id: String,
    event_id: String,
    key: String,
) -> Result<(), String> {
    let session = current(&state)?;
    let room_id = RoomId::parse(&room_id).map_err(err)?;
    let event_id: OwnedEventId = EventId::parse(&event_id).map_err(err)?;
    let live = session.live_timeline(&room_id).await?;
    live.timeline
        .toggle_reaction(&TimelineEventItemId::EventId(event_id), &key)
        .await
        .map(|_| ())
        .map_err(err)
}

#[tauri::command]
pub async fn mx_pinned_messages(
    state: State<'_, Matrix>,
    room_id: String,
) -> Result<Vec<MxEvent>, String> {
    let session = current(&state)?;
    let room = session.room(&room_id)?;
    if room.pinned_event_ids().is_none_or(|ids| ids.is_empty()) {
        return Ok(Vec::new());
    }
    let timeline = room
        .timeline_builder()
        .with_focus(TimelineFocus::PinnedEvents)
        .build()
        .await
        .map_err(err)?;
    Ok(timeline
        .items()
        .await
        .iter()
        .filter_map(|item| to_mx_event(room.room_id(), item))
        .collect())
}

/// The receipts that moved past where each reader was last seen.
fn moved(
    readers: &mut HashMap<String, u64>,
    receipts: impl Iterator<Item = MxReceipt>,
) -> Vec<MxReceipt> {
    receipts
        .filter(|receipt| {
            let seen = readers.entry(receipt.user_id.clone()).or_default();
            let rose = receipt.at > *seen;
            if rose {
                *seen = receipt.at;
            }
            rose
        })
        .collect()
}
