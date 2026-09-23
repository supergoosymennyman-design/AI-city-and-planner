# Local live-demo runbook

## Prepare

1. Close any server already using port `8377`.
2. Put your DeepSeek key in the existing gitignored `P5 Programme/buddy-kit/server/.env` as `DEEPSEEK_API_KEY=...`. Keep the file on this computer and do not paste the key into the browser. The local demo defaults to DeepSeek V4 Flash. Restart `npm run demo` after adding or changing the key.
3. From the repository root run `npm run demo`.
4. Open **http://localhost:8377/**. Keep this exact hostname and port for the whole demo; do not switch to `127.0.0.1`.
5. On the Hub, select **Run demo check**. The click makes one short live Buddy turn. Gateway reachability alone does not mean the AI is ready; wait for the DeepSeek reply result. A missing key or provider failure is shown as unavailable.
6. Open Fit Studio and AI Workshop from their Hub cards. Each opens its live site in a new tab; check that both load, then return to the Hub tab. Grant camera or microphone permission only when an activity needs it.
7. Open **Load example demo city** once to warm the large 3D assets, then return to the Hub.

The City, Planner, Academy, and project Hub use one local origin. Fit Studio and AI Workshop use separate live origins and save their own work separately. Internet access is required for both tools and Coding Buddy model calls.

## Suggested journey

Use **Workspaces** in the City HUD to move between local workspaces. Studio and Workshop also have project navigation when served by the local demo.

1. Hub: introduce the AI Champion and the connected workspaces.
2. Academy: open its Hub card, demonstrate one activity, then choose **Open Planner now**.
3. Planner: show **Example city**, make a small plan change, then choose **Explore city**.
4. Studio: use the City or Hub link, dress the Champion, then **Use in AI City**. With no saved plan, the Champion arrives in a clearly labelled example City; an existing saved city remains separate.
5. City: show the Champion and the result. Use **Workspaces** to open Workshop.
6. AI Workshop: demonstrate the online tool, then use **Return to Hub**.

Workshop work is stored separately from the local City project. Studio's **Use in AI City** action explicitly transfers the Champion on the same local origin.

## Recovery

- If a student city is unsuitable, choose **Load example demo city** on the Hub. It does not replace the saved city.
- If a live tool cannot connect, return to the Hub tab and continue the local demonstration.
- Keep a downloaded Champion File as the portable backup.
- Local demo cloud codes persist in `P5 Programme/.demo-data/`. Clear only those demo saves with `npm run demo:reset`.
