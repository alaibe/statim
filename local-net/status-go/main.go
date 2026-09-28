package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/golang/protobuf/proto"
	"github.com/status-im/markdown"
	"github.com/status-im/markdown/ast"
	bindata "github.com/status-im/migrate/v4/source/go_bindata"
	mvds "github.com/status-im/mvds/protobuf"
	"golang.org/x/crypto/pbkdf2"

	"github.com/status-im/status-go/internal/crypto"
	"github.com/status-im/status-go/internal/instrumentation/trace"
	"github.com/status-im/status-go/internal/protocol/audio"
	"github.com/status-im/status-go/internal/protocol/protobuf"
	v1protocol "github.com/status-im/status-go/internal/protocol/v1"
	"github.com/status-im/status-go/internal/testutils"
	"github.com/status-im/status-go/pkg/messaging/layers/encryption"
	"github.com/status-im/status-go/pkg/messaging/layers/encryption/migrations"
	"github.com/status-im/status-go/pkg/messaging/layers/reliability/datasync"
	"github.com/status-im/status-go/pkg/messaging/layers/segmentation"
	segmentationmigrations "github.com/status-im/status-go/pkg/messaging/layers/segmentation/migrations"
	"github.com/status-im/status-go/pkg/messaging/layers/transport"
	"github.com/status-im/status-go/pkg/messaging/layers/transport/rfc26"
	"github.com/status-im/status-go/pkg/messaging/waku/common"
	"github.com/status-im/status-go/pkg/multiformat"
)

func gcmSeal(key, plaintext []byte) []byte {
	gcm := must(cipher.NewGCM(must(aes.NewCipher(key))))
	nonce := make([]byte, gcm.NonceSize())
	must(rand.Read(nonce))
	return gcm.Seal(nonce, nonce, plaintext, nil)
}

func tinyPNG(shade uint8) []byte {
	picture := image.NewGray(image.Rect(0, 0, 2, 2))
	for i := range picture.Pix {
		picture.Pix[i] = shade
	}
	var out bytes.Buffer
	must(0, png.Encode(&out, picture))
	return out.Bytes()
}

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

func hx(b []byte) string { return "0x" + hex.EncodeToString(b) }

func unhex(s string) []byte {
	return must(hex.DecodeString(strings.TrimPrefix(s, "0x")))
}

func keyFromSeed(seed string) *ecdsa.PrivateKey {
	return must(crypto.ToECDSA(crypto.Keccak256([]byte(seed))))
}

func newProtocol(installationID string) *encryption.Protocol {
	db := must(testutils.SetupTestMemorySQLDB(testutils.NewTestDBInitializer([]*bindata.AssetSource{
		{Names: migrations.AssetNames(), AssetFunc: migrations.Asset},
	})))
	return encryption.New(encryption.NewSQLitePersistence(db), installationID, testutils.MustCreateTestLogger(), trace.NewNoopTracer())
}

func contentTopic(name string) string {
	return common.BytesToTopic(transport.ToTopic(name)).ContentTopic()
}

type keyVector struct {
	Seed                    string `json:"seed"`
	Private                 string `json:"private"`
	Public                  string `json:"public"`
	Compressed              string `json:"compressed"`
	CompressedMultiformat   string `json:"compressedMultiformat"`
	PartitionedTopic        string `json:"partitionedTopic"`
	PartitionedContentTopic string `json:"partitionedContentTopic"`
	PersonalTopic           string `json:"personalTopic"`
	PersonalContentTopic    string `json:"personalContentTopic"`
	ContactCodeContentTopic string `json:"contactCodeContentTopic"`
}

func describeKey(seed string, key *ecdsa.PrivateKey) keyVector {
	pub := &key.PublicKey
	return keyVector{
		Seed:                    seed,
		Private:                 hx(crypto.FromECDSA(key)),
		Public:                  hx(crypto.FromECDSAPub(pub)),
		Compressed:              hx(crypto.CompressPubkey(pub)),
		CompressedMultiformat:   must(multiformat.SerializeLegacyKey(hx(crypto.FromECDSAPub(pub)))),
		PartitionedTopic:        transport.PartitionedTopic(pub),
		PartitionedContentTopic: contentTopic(transport.PartitionedTopic(pub)),
		PersonalTopic:           transport.PersonalDiscoveryTopic(pub),
		PersonalContentTopic:    contentTopic(transport.PersonalDiscoveryTopic(pub)),
		ContactCodeContentTopic: contentTopic(transport.ContactCodeTopic(pub)),
	}
}

type pipelineVector struct {
	Sender       string `json:"sender"`
	Recipient    string `json:"recipient"`
	ContentTopic string `json:"contentTopic"`
	WakuPayload  string `json:"wakuPayload"`
	Installation string `json:"installation"`
	MvdsPayload  string `json:"mvdsPayload"`
	MvdsID       string `json:"mvdsId"`
	GroupID      string `json:"groupId"`
	Amm          string `json:"amm"`
	MessageID    string `json:"messageId"`
	Type         string `json:"type"`
}

func wrapAmm(payload []byte, kind protobuf.ApplicationMetadataMessage_Type, key *ecdsa.PrivateKey) ([]byte, string) {
	amm := must(v1protocol.WrapIntoAppLayerMessage(payload, kind, key))
	id := crypto.Keccak256(append(crypto.FromECDSAPub(&key.PublicKey), amm...))
	return amm, hx(id)
}

func buildPipeline(sender *ecdsa.PrivateKey, senderProtocol *encryption.Protocol, installation string, recipient *ecdsa.PublicKey, amm []byte, messageID string, kind protobuf.ApplicationMetadataMessage_Type, timestamp int64) pipelineVector {
	groupID := datasync.ToOneToOneGroupID(&sender.PublicKey, recipient)
	message := &mvds.Message{GroupId: groupID[:], Timestamp: timestamp, Body: amm}
	mvdsBytes := must(proto.Marshal(&mvds.Payload{Messages: []*mvds.Message{message}}))
	mvdsID := message.ID()

	spec := must(senderProtocol.BuildEncryptedMessage(sender, recipient, mvdsBytes))
	pm := must(proto.Marshal(spec.Message))
	waku := must(rfc26.Encode(pm, nil, recipient, sender))
	return pipelineVector{
		Sender:       hx(crypto.FromECDSAPub(&sender.PublicKey)),
		Recipient:    hx(crypto.FromECDSAPub(recipient)),
		ContentTopic: contentTopic(transport.PartitionedTopic(recipient)),
		WakuPayload:  hx(waku),
		Installation: installation,
		MvdsPayload:  hx(mvdsBytes),
		MvdsID:       hx(mvdsID[:]),
		GroupID:      hx(groupID[:]),
		Amm:          hx(amm),
		MessageID:    messageID,
		Type:         kind.String(),
	}
}

func signEvent(event *v1protocol.MembershipUpdateEvent, key *ecdsa.PrivateKey) {
	must(0, event.Sign(key))
}

func vectors() any {
	alice := keyFromSeed("alice")
	bob := keyFromSeed("bob")
	carol := keyFromSeed("carol")
	aliceProtocol := newProtocol("alice-installation")

	signed := []byte("status-original interop")
	signature := must(crypto.Sign(crypto.Keccak256(signed), alice))

	shared := must(crypto.GenerateSharedKey(alice, &bob.PublicKey))
	keyString := hex.EncodeToString(shared)

	const clock = uint64(1_790_000_060_000)
	const timestamp = uint64(1_790_000_000_000)
	chat := &protobuf.ChatMessage{
		Clock:       clock,
		Timestamp:   timestamp,
		Text:        "hello from status-go",
		ChatId:      hx(crypto.FromECDSAPub(&bob.PublicKey)),
		MessageType: protobuf.MessageType_ONE_TO_ONE,
		ContentType: protobuf.ChatMessage_TEXT_PLAIN,
		DisplayName: "Alice",
		ContactRequestPropagatedState: &protobuf.ContactRequestPropagatedState{
			LocalClock: clock - 5, LocalState: 2, RemoteClock: 0, RemoteState: 0,
		},
	}
	chatBytes := must(proto.Marshal(chat))
	amm, messageID := wrapAmm(chatBytes, protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, alice)

	groupID := datasync.ToOneToOneGroupID(&alice.PublicKey, &bob.PublicKey)
	mvdsMessage := &mvds.Message{GroupId: groupID[:], Timestamp: 1_790_000_000, Body: amm}
	mvdsBytes := must(proto.Marshal(&mvds.Payload{Messages: []*mvds.Message{mvdsMessage}}))
	mvdsID := mvdsMessage.ID()
	ackBytes := must(proto.Marshal(&mvds.Payload{Acks: [][]byte{mvdsID[:]}}))

	symKey := pbkdf2.Key([]byte(keyString), nil, 65356, 32, sha256.New)

	direct := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, amm, messageID, protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, 1_790_000_000)

	request := &protobuf.ChatMessage{
		Clock:       clock + 10,
		Timestamp:   timestamp + 10,
		Text:        "Please add me to your contacts",
		ChatId:      hx(crypto.FromECDSAPub(&bob.PublicKey)),
		MessageType: protobuf.MessageType_ONE_TO_ONE,
		ContentType: protobuf.ChatMessage_CONTACT_REQUEST,
		DisplayName: "Alice",
		ContactRequestPropagatedState: &protobuf.ContactRequestPropagatedState{
			LocalClock: clock + 10, LocalState: 2,
		},
	}
	requestAmm, requestID := wrapAmm(must(proto.Marshal(request)), protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, alice)
	contactRequest := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, requestAmm, requestID, protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, 1_790_000_001)

	accept := &protobuf.AcceptContactRequest{Id: requestID, Clock: clock + 20}
	acceptAmm, acceptID := wrapAmm(must(proto.Marshal(accept)), protobuf.ApplicationMetadataMessage_ACCEPT_CONTACT_REQUEST, alice)
	acceptPipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, acceptAmm, acceptID, protobuf.ApplicationMetadataMessage_ACCEPT_CONTACT_REQUEST, 1_790_000_002)

	reaction := &protobuf.EmojiReaction{
		Clock: clock + 30, ChatId: hx(crypto.FromECDSAPub(&bob.PublicKey)), MessageId: messageID,
		MessageType: protobuf.MessageType_ONE_TO_ONE, Emoji: "👍",
	}
	reactionAmm, reactionID := wrapAmm(must(proto.Marshal(reaction)), protobuf.ApplicationMetadataMessage_EMOJI_REACTION, alice)
	reactionPipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, reactionAmm, reactionID, protobuf.ApplicationMetadataMessage_EMOJI_REACTION, 1_790_000_003)

	adts := []byte{0xFF, 0xF1, 0x50, 0x80, 0x01, 0x7F, 0xFC, 0x21, 0x00, 0x49, 0x90, 0x02, 0x19, 0x00, 0x23, 0x80}
	voice := &protobuf.ChatMessage{
		Clock: clock + 30, Timestamp: timestamp + 30, ChatId: hx(crypto.FromECDSAPub(&bob.PublicKey)),
		Text:        "Update to latest version to listen to an audio message here!",
		MessageType: protobuf.MessageType_ONE_TO_ONE, ContentType: protobuf.ChatMessage_AUDIO, DisplayName: "Alice",
		Payload: &protobuf.ChatMessage_Audio{Audio: &protobuf.AudioMessage{Payload: adts, Type: audio.Type(adts), DurationMs: 1500}},
	}
	voiceAmm, voiceID := wrapAmm(must(proto.Marshal(voice)), protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, alice)
	voicePipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, voiceAmm, voiceID, protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, 1_790_000_004)

	edit := &protobuf.EditMessage{
		Clock: clock + 35, Text: "hello from status-go, edited", ChatId: hx(crypto.FromECDSAPub(&bob.PublicKey)),
		MessageId: messageID, MessageType: protobuf.MessageType_ONE_TO_ONE, ContentType: protobuf.ChatMessage_TEXT_PLAIN,
	}
	editAmm, editID := wrapAmm(must(proto.Marshal(edit)), protobuf.ApplicationMetadataMessage_EDIT_MESSAGE, alice)
	editPipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, editAmm, editID, protobuf.ApplicationMetadataMessage_EDIT_MESSAGE, 1_790_000_005)

	deletion := &protobuf.DeleteMessage{
		Clock: clock + 36, ChatId: hx(crypto.FromECDSAPub(&bob.PublicKey)), MessageId: requestID, MessageType: protobuf.MessageType_ONE_TO_ONE,
	}
	deleteAmm, deleteID := wrapAmm(must(proto.Marshal(deletion)), protobuf.ApplicationMetadataMessage_DELETE_MESSAGE, alice)
	deletePipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, deleteAmm, deleteID, protobuf.ApplicationMetadataMessage_DELETE_MESSAGE, 1_790_000_006)

	groupChatID := "7d2a3f58-1c2b-4c8e-9d4f-0a1b2c3d4e5f-" + hx(crypto.FromECDSAPub(&alice.PublicKey))
	created := v1protocol.NewChatCreatedEvent("Interop", "#887af9", clock+40)
	created.ChatID = groupChatID
	signEvent(&created, alice)
	added := v1protocol.NewMembersAddedEvent([]string{hx(crypto.FromECDSAPub(&bob.PublicKey)), hx(crypto.FromECDSAPub(&carol.PublicKey))}, clock+41)
	added.ChatID = groupChatID
	signEvent(&added, alice)
	group := must(v1protocol.NewGroupWithEvents(groupChatID, []v1protocol.MembershipUpdateEvent{created, added}))
	groupMessage := &protobuf.ChatMessage{
		Clock: clock + 42, Timestamp: timestamp + 42, Text: "hello group", ChatId: groupChatID,
		MessageType: protobuf.MessageType_PRIVATE_GROUP, ContentType: protobuf.ChatMessage_TEXT_PLAIN, DisplayName: "Alice",
	}
	membership := must(v1protocol.EncodeMembershipUpdateMessage(v1protocol.MembershipUpdateMessage{
		ChatID: groupChatID, Events: group.Events(), Message: groupMessage,
	}))
	groupAmm, groupMessageID := wrapAmm(membership, protobuf.ApplicationMetadataMessage_MEMBERSHIP_UPDATE_MESSAGE, alice)
	groupPipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, groupAmm, groupMessageID, protobuf.ApplicationMetadataMessage_MEMBERSHIP_UPDATE_MESSAGE, 1_790_000_004)

	groupPicture := tinyPNG(0x80)
	imageChanged := v1protocol.NewImageChangedEvent(groupPicture, clock+43)
	imageChanged.ChatID = groupChatID
	signEvent(&imageChanged, alice)
	pictured := must(v1protocol.NewGroupWithEvents(groupChatID, []v1protocol.MembershipUpdateEvent{created, added, imageChanged}))
	pictureUpdate := must(v1protocol.EncodeMembershipUpdateMessage(v1protocol.MembershipUpdateMessage{ChatID: groupChatID, Events: pictured.Events()}))
	pictureAmm, pictureID := wrapAmm(pictureUpdate, protobuf.ApplicationMetadataMessage_MEMBERSHIP_UPDATE_MESSAGE, alice)
	picturePipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, pictureAmm, pictureID, protobuf.ApplicationMetadataMessage_MEMBERSHIP_UPDATE_MESSAGE, 1_790_000_008)

	large, thumbnail := tinyPNG(0x40), tinyPNG(0xc0)
	identityImages := map[string]*protobuf.IdentityImage{
		"large":     {Payload: large, SourceType: protobuf.IdentityImage_RAW_PAYLOAD, ImageFormat: protobuf.ImageFormat_PNG},
		"thumbnail": {Payload: thumbnail, SourceType: protobuf.IdentityImage_RAW_PAYLOAD, ImageFormat: protobuf.ImageFormat_PNG},
	}
	imagesKey := make([]byte, 32)
	must(rand.Read(imagesKey))
	for _, ii := range identityImages {
		ii.Payload = gcmSeal(imagesKey, ii.Payload)
		ii.Encrypted = true
		for _, contact := range []*ecdsa.PublicKey{&carol.PublicKey, &bob.PublicKey} {
			ii.EncryptionKeys = append(ii.EncryptionKeys, gcmSeal(must(crypto.GenerateSharedKey(alice, contact)), imagesKey))
		}
	}
	identity := &protobuf.ChatIdentity{Clock: clock + 50, DisplayName: "Alice", Images: identityImages}
	identityAmm, identityID := wrapAmm(must(proto.Marshal(identity)), protobuf.ApplicationMetadataMessage_CHAT_IDENTITY, alice)
	identityPipeline := buildPipeline(alice, aliceProtocol, "alice-installation", &bob.PublicKey, identityAmm, identityID, protobuf.ApplicationMetadataMessage_CHAT_IDENTITY, 1_790_000_007)

	rawEvents := []string{}
	for _, e := range group.Events() {
		rawEvents = append(rawEvents, hx(append(append([]byte{}, e.Signature...), e.RawPayload...)))
	}

	return map[string]any{
		"keys":      []keyVector{describeKey("alice", alice), describeKey("bob", bob), describeKey("carol", carol)},
		"signature": map[string]string{"message": string(signed), "signer": hx(crypto.FromECDSAPub(&alice.PublicKey)), "signature": hx(signature)},
		"ecdh":      map[string]string{"private": hx(crypto.FromECDSA(alice)), "public": hx(crypto.FromECDSAPub(&bob.PublicKey)), "shared": hx(shared)},
		"negotiated": map[string]string{
			"secret": hx(shared), "contentTopic": contentTopic(keyString), "symKey": hx(symKey),
		},
		"amm": map[string]string{"chatMessage": hx(chatBytes), "amm": hx(amm), "messageId": messageID, "signer": hx(crypto.FromECDSAPub(&alice.PublicKey))},
		"mvds": map[string]string{
			"groupId": hx(groupID[:]), "payload": hx(mvdsBytes), "messageId": hx(mvdsID[:]), "ack": hx(ackBytes),
			"timestamp": "1790000000", "body": hx(amm),
		},
		"rfc26Asymmetric": map[string]string{"payload": hx(must(rfc26.Encode(mvdsBytes, nil, &bob.PublicKey, alice))), "data": hx(mvdsBytes), "recipientPrivate": hx(crypto.FromECDSA(bob)), "signer": hx(crypto.FromECDSAPub(&alice.PublicKey))},
		"rfc26Symmetric":  map[string]string{"payload": hx(must(rfc26.Encode(mvdsBytes, symKey, nil, alice))), "data": hx(mvdsBytes), "symKey": hx(symKey), "signer": hx(crypto.FromECDSAPub(&alice.PublicKey))},
		"direct":          direct,
		"contactRequest":  contactRequest,
		"accept":          acceptPipeline,
		"reaction":        reactionPipeline,
		"edit":            editPipeline,
		"voice":           voicePipeline,
		"groupPicture":    map[string]any{"message": picturePipeline, "image": hx(groupPicture)},
		"identity":        map[string]any{"message": identityPipeline, "large": hx(large), "thumbnail": hx(thumbnail)},
		"delete":          deletePipeline,
		"group":           groupPipeline,
		"groupEvents":     map[string]any{"chatId": groupChatID, "events": rawEvents, "name": group.Name(), "members": group.Members(), "admins": group.Admins()},
	}
}

type decodedMessage struct {
	Type      string   `json:"type"`
	Signer    string   `json:"signer"`
	MessageID string   `json:"messageId"`
	Payload   any      `json:"payload"`
	Problem   string   `json:"problem,omitempty"`
	Mentions  []string `json:"mentions,omitempty"`
}

func mentionsIn(text string) []string {
	var found []string
	ast.WalkFunc(markdown.Parse([]byte(text), nil), func(node ast.Node, entering bool) ast.WalkStatus {
		if mention, ok := node.(*ast.Mention); ok && entering {
			found = append(found, string(mention.Literal))
		}
		return ast.GoToNext
	})
	return found
}

var displayNameRegex = regexp.MustCompile(`^[\p{L}\p{M}\p{N}_\-\s]+$`)

func validateDisplayName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if l := utf8.RuneCountInString(name); l < 5 || l > 24 {
		return "display name length"
	}
	if !displayNameRegex.MatchString(name) {
		return "display name characters"
	}
	for _, ext := range []string{"_eth", ".eth", "-eth"} {
		if strings.HasSuffix(name, ext) {
			return "display name ends in eth"
		}
	}
	return ""
}

func validateChat(message *protobuf.ChatMessage, wakuTimestampMs uint64) string {
	if message.Clock == 0 {
		return "clock can't be 0"
	}
	if message.Clock > wakuTimestampMs && message.Clock-wakuTimestampMs > 120000 {
		return "clock value too high"
	}
	if message.Timestamp == 0 {
		return "timestamp can't be 0"
	}
	if message.ContentType != protobuf.ChatMessage_IMAGE && len(strings.TrimSpace(message.Text)) == 0 {
		return "text can't be empty"
	}
	if message.ChatId == "" {
		return "chatId can't be empty"
	}
	if message.MessageType == protobuf.MessageType_UNKNOWN_MESSAGE_TYPE {
		return "unknown message type"
	}
	if message.ContentType == protobuf.ChatMessage_UNKNOWN_CONTENT_TYPE {
		return "unknown content type"
	}
	if message.ContentType == protobuf.ChatMessage_AUDIO {
		voice := message.GetAudio()
		if voice == nil || len(voice.Payload) == 0 {
			return "audio payload empty"
		}
		if voice.Type == protobuf.AudioMessage_UNKNOWN_AUDIO_TYPE || audio.Type(voice.Payload) != voice.Type {
			return "audio type unknown or not what the payload is"
		}
	}
	return validateDisplayName(message.DisplayName)
}

func decodeApplication(body []byte, wakuTimestampMs uint64) decodedMessage {
	amm := must(protobuf.Unmarshal(body))
	signer, err := crypto.SigToPub(crypto.Keccak256(amm.Payload), amm.Signature)
	if err != nil {
		return decodedMessage{Type: amm.Type.String(), Problem: "bad signature: " + err.Error()}
	}
	out := decodedMessage{
		Type:      amm.Type.String(),
		Signer:    hx(crypto.FromECDSAPub(signer)),
		MessageID: hx(crypto.Keccak256(append(crypto.FromECDSAPub(signer), body...))),
	}
	switch amm.Type {
	case protobuf.ApplicationMetadataMessage_CHAT_MESSAGE:
		var m protobuf.ChatMessage
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
		out.Problem = validateChat(&m, wakuTimestampMs)
		out.Mentions = mentionsIn(m.Text)
	case protobuf.ApplicationMetadataMessage_EMOJI_REACTION:
		var m protobuf.EmojiReaction
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
	case protobuf.ApplicationMetadataMessage_EDIT_MESSAGE:
		var m protobuf.EditMessage
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
		switch {
		case m.Clock == 0 || m.ChatId == "" || m.MessageId == "":
			out.Problem = "edit is missing its clock, chat or message"
		case m.MessageType == protobuf.MessageType_UNKNOWN_MESSAGE_TYPE || m.MessageType == protobuf.MessageType_SYSTEM_MESSAGE_PRIVATE_GROUP:
			out.Problem = "unknown message type"
		case len(strings.TrimSpace(m.Text)) == 0:
			out.Problem = "text can't be empty"
		}
	case protobuf.ApplicationMetadataMessage_DELETE_MESSAGE:
		var m protobuf.DeleteMessage
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
		if m.ChatId == "" || m.MessageId == "" || m.MessageType == protobuf.MessageType_UNKNOWN_MESSAGE_TYPE || m.MessageType == protobuf.MessageType_SYSTEM_MESSAGE_PRIVATE_GROUP {
			out.Problem = "invalid delete"
		}
	case protobuf.ApplicationMetadataMessage_ACCEPT_CONTACT_REQUEST:
		var m protobuf.AcceptContactRequest
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
	case protobuf.ApplicationMetadataMessage_RETRACT_CONTACT_REQUEST:
		var m protobuf.RetractContactRequest
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
	case protobuf.ApplicationMetadataMessage_CONTACT_UPDATE:
		var m protobuf.ContactUpdate
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
		out.Problem = validateDisplayName(m.DisplayName)
	case protobuf.ApplicationMetadataMessage_CHAT_IDENTITY:
		var m protobuf.ChatIdentity
		must(0, proto.Unmarshal(amm.Payload, &m))
		out.Payload = &m
		if m.Clock == 0 {
			out.Problem = "clock value unset"
		} else {
			out.Problem = validateDisplayName(m.DisplayName)
		}
	case protobuf.ApplicationMetadataMessage_MEMBERSHIP_UPDATE_MESSAGE:
		var raw protobuf.MembershipUpdateMessage
		must(0, proto.Unmarshal(amm.Payload, &raw))
		parsed, err := v1protocol.MembershipUpdateMessageFromProtobuf(&raw)
		if err != nil {
			out.Problem = "events: " + err.Error()
			break
		}
		group, err := v1protocol.NewGroupWithEvents(parsed.ChatID, parsed.Events)
		if err != nil {
			out.Problem = "group: " + err.Error()
			break
		}
		payload := map[string]any{"chatId": parsed.ChatID, "name": group.Name(), "members": group.Members(), "admins": group.Admins(), "events": len(parsed.Events)}
		if parsed.Message != nil {
			payload["message"] = parsed.Message
			out.Problem = validateChat(parsed.Message, wakuTimestampMs)
			out.Mentions = mentionsIn(parsed.Message.Text)
		}
		if parsed.EmojiReaction != nil {
			payload["emojiReaction"] = parsed.EmojiReaction
		}
		out.Payload = payload
	}
	return out
}

func decode(recipientHex, payloadHex, symKeyHex string, wakuTimestampMs uint64) any {
	recipient := must(crypto.ToECDSA(unhex(recipientHex)))
	var decoded *rfc26.DecodedPayload
	var err error
	if symKeyHex != "" {
		decoded, err = rfc26.Decode(unhex(payloadHex), &rfc26.KeyInfo{Kind: rfc26.Symmetric, SymKey: unhex(symKeyHex)})
	} else {
		decoded, err = rfc26.Decode(unhex(payloadHex), &rfc26.KeyInfo{Kind: rfc26.Asymmetric, PrivKey: recipient})
	}
	if err != nil {
		return map[string]string{"error": "rfc26: " + err.Error()}
	}
	if decoded.PubKey == nil {
		return map[string]string{"error": "rfc26: unsigned"}
	}
	out := map[string]any{"transportSigner": hx(crypto.FromECDSAPub(decoded.PubKey)), "paddingLength": len(decoded.Padding)}

	var pm encryption.ProtocolMessage
	if err := proto.Unmarshal(decoded.Data, &pm); err != nil {
		out["error"] = "protocol message: " + err.Error()
		return out
	}
	out["installation"] = pm.InstallationId
	out["bundles"] = len(pm.Bundles)
	keys := []string{}
	for k := range pm.EncryptedMessage {
		keys = append(keys, k)
	}
	out["encryptedFor"] = keys

	protocol := newProtocol("recipient-installation")
	response, err := protocol.HandleMessage(context.Background(), recipient, decoded.PubKey, &pm, crypto.Keccak256([]byte(payloadHex)))
	if err != nil {
		out["error"] = "encryption: " + err.Error()
		return out
	}
	body := response.DecryptedMessage
	installations := []string{}
	for _, installation := range response.Installations {
		installations = append(installations, installation.ID)
	}
	out["newInstallations"] = installations
	replyPayload, _, replyTargets := chatPipeline(recipient, protocol, decoded.PubKey, "reply from status-go", uint64(wakuTimestampMs))
	out["replyEncryptedFor"] = replyTargets
	out["replyPayload"] = replyPayload

	var ds mvds.Payload
	bodies := [][]byte{body}
	if proto.Unmarshal(body, &ds) == nil && ds.IsValid() {
		bodies = nil
		acks := []string{}
		for _, a := range ds.Acks {
			acks = append(acks, hx(a))
		}
		out["mvdsAcks"] = acks
		for _, m := range ds.Messages {
			id := m.ID()
			out["mvdsMessageId"] = hx(id[:])
			out["mvdsGroupId"] = hx(m.GroupId)
			bodies = append(bodies, m.Body)
		}
	} else {
		out["mvds"] = false
	}
	messages := []decodedMessage{}
	for _, b := range bodies {
		messages = append(messages, decodeApplication(b, wakuTimestampMs))
	}
	out["messages"] = messages
	return out
}

type ratchetMessage struct {
	Text        string `json:"text"`
	WakuPayload string `json:"wakuPayload"`
	MessageID   string `json:"messageId"`
}

func chatPipeline(sender *ecdsa.PrivateKey, senderProtocol *encryption.Protocol, recipient *ecdsa.PublicKey, text string, clock uint64) (string, string, []string) {
	chat := &protobuf.ChatMessage{
		Clock: clock, Timestamp: clock, Text: text, ChatId: hx(crypto.FromECDSAPub(recipient)),
		MessageType: protobuf.MessageType_ONE_TO_ONE, ContentType: protobuf.ChatMessage_TEXT_PLAIN,
	}
	amm, id := wrapAmm(must(proto.Marshal(chat)), protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, sender)
	groupID := datasync.ToOneToOneGroupID(&sender.PublicKey, recipient)
	mvdsBytes := must(proto.Marshal(&mvds.Payload{Messages: []*mvds.Message{{GroupId: groupID[:], Timestamp: int64(clock / 1000), Body: amm}}}))
	spec := must(senderProtocol.BuildEncryptedMessage(sender, recipient, mvdsBytes))
	targets := []string{}
	for k := range spec.Message.EncryptedMessage {
		targets = append(targets, k)
	}
	waku := must(rfc26.Encode(must(proto.Marshal(spec.Message)), nil, recipient, sender))
	return hx(waku), id, targets
}

func ratchet() any {
	alice := keyFromSeed("alice")
	bob := keyFromSeed("bob")
	spk := keyFromSeed("bob-signed-pre-key")
	const installation = "bob-installation"
	container := &encryption.BundleContainer{
		Bundle: &encryption.Bundle{
			Identity: crypto.CompressPubkey(&bob.PublicKey),
			SignedPreKeys: map[string]*encryption.SignedPreKey{
				installation: {SignedPreKey: crypto.CompressPubkey(&spk.PublicKey)},
			},
		},
		PrivateSignedPreKey: crypto.FromECDSA(spk),
	}
	must(0, encryption.SignBundle(bob, container))
	bundleBytes := must(proto.Marshal(container.Bundle))

	aliceProtocol := newProtocol("alice-installation")
	must(aliceProtocol.ProcessPublicBundle(alice, container.Bundle))
	messages := []ratchetMessage{}
	var targets []string
	for i := 1; i <= 5; i++ {
		text := fmt.Sprintf("ratchet %d", i)
		payload, id, t := chatPipeline(alice, aliceProtocol, &bob.PublicKey, text, uint64(1_790_000_000_000+i))
		targets = t
		messages = append(messages, ratchetMessage{Text: text, WakuPayload: payload, MessageID: id})
	}
	return map[string]any{
		"identityPrivate":     hx(crypto.FromECDSA(bob)),
		"signedPreKeyPrivate": hx(crypto.FromECDSA(spk)),
		"installation":        installation,
		"bundle":              hx(bundleBytes),
		"bundleTimestamp":     fmt.Sprint(container.Bundle.Timestamp),
		"bundleSignature":     hx(container.Bundle.Signature),
		"encryptedFor":        targets,
		"sender":              hx(crypto.FromECDSAPub(&alice.PublicKey)),
		"senderInstallation":  "alice-installation",
		"messages":            messages,
	}
}

func newSegmenter() *segmentation.Segmenter {
	db := must(testutils.SetupTestMemorySQLDB(testutils.NewTestDBInitializer([]*bindata.AssetSource{
		{Names: segmentationmigrations.AssetNames(), AssetFunc: segmentationmigrations.Asset},
	})))
	return segmentation.NewSegmenter(segmentation.NewSQLitePersistence(db), testutils.MustCreateTestLogger())
}

func segments() any {
	alice := keyFromSeed("alice")
	bob := keyFromSeed("bob")
	image := make([]byte, 30_000)
	for i := range image {
		image[i] = byte(i * 7 % 251)
	}
	chat := &protobuf.ChatMessage{
		Clock: 1_790_000_000_500, Timestamp: 1_790_000_000_500, ChatId: hx(crypto.FromECDSAPub(&bob.PublicKey)),
		MessageType: protobuf.MessageType_ONE_TO_ONE, ContentType: protobuf.ChatMessage_IMAGE,
		Payload: &protobuf.ChatMessage_Image{Image: &protobuf.ImageMessage{Payload: image, Format: protobuf.ImageFormat_JPEG, Width: 640, Height: 480}},
	}
	amm, id := wrapAmm(must(proto.Marshal(chat)), protobuf.ApplicationMetadataMessage_CHAT_MESSAGE, alice)
	groupID := datasync.ToOneToOneGroupID(&alice.PublicKey, &bob.PublicKey)
	mvdsBytes := must(proto.Marshal(&mvds.Payload{Messages: []*mvds.Message{{GroupId: groupID[:], Timestamp: 1_790_000_000, Body: amm}}}))
	spec := must(newProtocol("alice-installation").BuildEncryptedMessage(alice, &bob.PublicKey, mvdsBytes))
	parts := must(newSegmenter().Segment(must(proto.Marshal(spec.Message)), 3_600))
	payloads := []string{}
	for _, part := range parts {
		payloads = append(payloads, hx(must(rfc26.Encode(part, nil, &bob.PublicKey, alice))))
	}
	return map[string]any{
		"recipient":    transport.PartitionedTopic(&bob.PublicKey),
		"contentTopic": contentTopic(transport.PartitionedTopic(&bob.PublicKey)),
		"messageId":    id,
		"imageHash":    hx(crypto.Keccak256(image)),
		"payloads":     payloads,
	}
}

func reassemble(recipientHex string, payloadHexes []string, wakuTimestampMs uint64) any {
	recipient := must(crypto.ToECDSA(unhex(recipientHex)))
	segmenter := newSegmenter()
	for i, payloadHex := range payloadHexes {
		decoded, err := rfc26.Decode(unhex(payloadHex), &rfc26.KeyInfo{Kind: rfc26.Asymmetric, PrivKey: recipient})
		if err != nil {
			return map[string]string{"error": "rfc26: " + err.Error()}
		}
		whole, _, err := segmenter.Reconstruct(decoded.Data, decoded.PubKey, []byte{byte(i)})
		if err == segmentation.ErrIncomplete {
			continue
		}
		if err != nil {
			return map[string]string{"error": "segments: " + err.Error()}
		}
		var pm encryption.ProtocolMessage
		must(0, proto.Unmarshal(whole, &pm))
		response := must(newProtocol("recipient-installation").HandleMessage(context.Background(), recipient, decoded.PubKey, &pm, []byte{1}))
		var ds mvds.Payload
		must(0, proto.Unmarshal(response.DecryptedMessage, &ds))
		out := decodeApplication(ds.Messages[0].Body, wakuTimestampMs)
		if chat, ok := out.Payload.(*protobuf.ChatMessage); ok && chat.GetImage() != nil {
			return map[string]any{"afterSegments": i + 1, "type": out.Type, "messageId": out.MessageID, "imageHash": hx(crypto.Keccak256(chat.GetImage().Payload)), "problem": out.Problem}
		}
		return map[string]any{"afterSegments": i + 1, "message": out}
	}
	return map[string]string{"error": "never completed"}
}

func main() {
	var result any
	switch os.Args[1] {
	case "vectors":
		result = vectors()
	case "ratchet":
		result = ratchet()
	case "segments":
		result = segments()
	case "reassemble":
		var ts uint64
		fmt.Sscan(os.Args[3], &ts)
		result = reassemble(os.Args[2], os.Args[4:], ts)
	case "decode":
		sym := ""
		if len(os.Args) > 4 {
			sym = os.Args[4]
		}
		var ts uint64
		if len(os.Args) > 5 {
			fmt.Sscan(os.Args[5], &ts)
		}
		result = decode(os.Args[2], os.Args[3], sym, ts)
	default:
		panic(errors.New("usage: interop vectors | decode <recipientPrivHex> <payloadHex> [symKeyHex] [wakuTimestampMs]"))
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	must(0, enc.Encode(result))
}
