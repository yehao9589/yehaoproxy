import test from "node:test";
import assert from "node:assert/strict";
import {normalizePreferences,notificationAllowed,notificationTopics} from "../lib/notification-preferences.ts";
test("defaults preserve existing notification delivery",()=>{const p=normalizePreferences(null);for(const topic of Object.keys(notificationTopics)){assert.equal(notificationAllowed(p,topic,"email"),true);assert.equal(notificationAllowed(p,topic,"site"),true)}});
test("channel master switch overrides topic without changing other channel",()=>{const p=normalizePreferences({email:false});assert.equal(notificationAllowed(p,"expiry","email"),false);assert.equal(notificationAllowed(p,"expiry","site"),true)});
test("individual topics and channels are independent",()=>{const p=normalizePreferences({topics:{purchase:{email:false,site:true}}});assert.equal(notificationAllowed(p,"purchase","email"),false);assert.equal(notificationAllowed(p,"purchase","site"),true);assert.equal(notificationAllowed(p,"expiry","email"),true)});
test("malformed settings cannot become truthy non-boolean switches",()=>{const p=normalizePreferences({email:"false",topics:{expiry:{site:"false"}}});assert.equal(typeof p.email,"boolean");assert.equal(typeof p.topics.expiry.site,"boolean")});
