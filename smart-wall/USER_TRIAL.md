# First Palettè user trial

Status: the feedback form and test procedure are ready. No real participants have been invited or observed yet. Automated checks and synthetic test feedback must not be counted as real usability evidence.

## Participants and timing

Recommended validation, not a separately prescribed internship deliverable: after deployment checks pass, invite 3–5 willing people. Include desktop and tablet coverage required by the brief; phone coverage is optional. Allow 10–15 minutes each. Get their agreement before observing or recording anything; do not record passwords or personal room photos. Use a sample room if they prefer.

The participant URL is `https://YOUR-DEPLOYED-URL/?trial=1`, or **Share trial feedback** in the footer. Locally, it is `http://127.0.0.1:4200/?trial=1`. The feedback page lists the tasks. Open Visualize from the header to do them and return to the feedback page afterward. The app currently keeps feedback answers while the feedback page stays open, so a separate tab is useful when completing tasks.

## Tasks to observe

1. Create an account and log in. Confirm saving is available without email verification in the default internship build.
2. Upload a suitable room photo, or load the sample. Outline one wall, lock the boundary and select its surface. Note where the user hesitates and whether paint reaches furniture, frames or the ceiling.
3. Try two colours and compare with the original. Ask which preview feels more useful and whether the user understands that real paint can look different.
4. Name and save two versions. Refresh, reopen a saved version and change a shade. Confirm the original photo and wall selection are preserved.
5. Delete one **disposable** version; check that the other remains. For the all-delete task, use a dedicated test account containing only disposable designs. Confirm the count and cancellation wording are understood.
6. Log out and log in again. Confirm the saved designs belong to this account. Do not ask participants to share passwords with the observer. Email recovery is an optional extra, outside this required-feature check.
7. Submit the ratings and note the biggest difficulty using the feedback form. Record failures as well as successes.

## Success criteria

- Every participant can register, log in and log out without needing an email provider.
- At least 4 of 5 complete upload → select → save → reopen without assistance; for 3 participants, report raw counts instead of claiming a reliable percentage.
- No participant loses a wanted design or sees another user's photos.
- Review cases where ease or wall-selection accuracy is rated below 4/5. Similar-coloured objects may still require Erase; capture the kind of problem in words, not the participant's photo.
- No blocking errors on the phone/computer used for the trial. Fix critical failures and retest those cases before inviting more users.

## Read the feedback privately

```powershell
npm run trial:report
```

Run this against the trial database (set MONGODB_URI and MONGODB_DATABASE when needed), from the backend host or on a private backup. It outputs counts, average ratings and individual notes as JSON. No public list of feedback exists. Feedback records do not automatically contain account identities, photo data, passwords or precise device fingerprints. Free-text notes can contain whatever a participant types, so keep the report private and choose a retention period for the trial.

## Observation sheet

| Participant alias | Device | Register/login | Upload/select | Save/reopen | Delete safely | Log out/in | Main difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Pending | Pending | Pending | Pending | Pending | Pending | |
| P2 | Pending | Pending | Pending | Pending | Pending | Pending | |
| P3 | Pending | Pending | Pending | Pending | Pending | Pending | |
| P4 | Optional | Pending | Pending | Pending | Pending | Pending | |
| P5 | Optional | Pending | Pending | Pending | Pending | Pending | |

Leave these rows pending until someone actually participates. At the end, summarize completion counts, account or task failures, top three usability issues and the fixes needed before a wider release.

## Internship-specific acceptance additions

After the original tasks, test a dual-tone design (change division and second colour), then a repeating pattern (change scale and colours). Save separate versions, refresh/reopen and confirm settings/original selection persist. Save a favourite shade and pattern and find them on Dashboard. Open the footer help and check whether the instructions resolve confusion.

An authorised evaluator should separately test Admin: create/edit/archive a disposable shade and pattern, confirm the public catalogue changes, inspect activity/feedback, review a disposable room with a recorded reason, and verify that an ordinary user cannot access admin routes. Test account disabling only on disposable accounts. Do not use real participants' room photos for admin demonstrations without an agreed purpose.

Engineering checks on 2026-10-23 used isolated synthetic accounts/data, not trial participants. Participant rows above remain Pending.
