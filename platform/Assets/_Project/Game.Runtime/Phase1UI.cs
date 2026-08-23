using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace AI2School.Game
{
    /// <summary>Minimal Phase 1 HUD built in code: palette, budget, mode, metric chip, save/load, summary.</summary>
    public class Phase1UI
    {
        readonly CityController _city;
        readonly Canvas _canvas;
        readonly Text _budgetText;
        readonly Text _modeText;
        readonly Text _coverageText;
        readonly Text _statusText;
        readonly Text _summaryText;
        Button _runButton;

        public Phase1UI(CityController city)
        {
            _city = city;

            var canvasGo = new GameObject("Phase1UI");
            _canvas = canvasGo.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasGo.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 800);
            canvasGo.AddComponent<GraphicRaycaster>();

            if (Object.FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            // Top bar
            var top = NewPanel("TopBar", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0.5f, 0.5f), new Vector2(0, 0), new Vector2(1280, 48));
            AddImage(top, new Color(0.10f, 0.12f, 0.16f, 0.92f));
            _modeText = AddText(top, "PLANNING", 16, FontStyle.Bold, new Vector2(0f, 0f), new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 0), new Vector2(220, 40), TextAnchor.MiddleLeft);
            _budgetText = AddText(top, "Budget", 16, FontStyle.Bold, new Vector2(0.5f, 0f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 0), new Vector2(300, 40), TextAnchor.MiddleCenter);
            _coverageText = AddText(top, "Coverage —", 16, FontStyle.Bold, new Vector2(1f, 0f), new Vector2(1f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 0), new Vector2(260, 40), TextAnchor.MiddleRight);

            // Left palette
            var palette = NewPanel("Palette", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0.5f, 0.5f), new Vector2(16, -64), new Vector2(150, 300));
            AddImage(palette, new Color(0.12f, 0.14f, 0.19f, 0.9f));
            AddText(palette, "Build", 14, FontStyle.Bold, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0, -8), new Vector2(140, 24), TextAnchor.MiddleCenter);
            float y = -36;
            foreach (var p in _city.Manifest.palette)
            {
                string id = p.pieceId;
                var btn = MakeButton(palette, p.pieceId + "  $" + p.cost, new Vector2(10, y), new Vector2(130, 44),
                    () => { _city.SelectedPaletteId = id; });
                var img = btn.GetComponent<Image>();
                img.color = ColorFor(p.category);
                y -= 52;
            }

            // Right actions
            var actions = NewPanel("Actions", new Vector2(1, 1), new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-16, -64), new Vector2(150, 260));
            AddImage(actions, new Color(0.12f, 0.14f, 0.19f, 0.9f));
            _runButton = MakeButton(actions, "▶ Run", new Vector2(10, -10), new Vector2(130, 52), () => _city.StartSimulation());
            MakeButton(actions, "💾 Save", new Vector2(10, -70), new Vector2(130, 44), () => _city.AutoSave());
            MakeButton(actions, "📂 Load", new Vector2(10, -122), new Vector2(130, 44), () => { _city.LoadSave(); _city.ApplyVisuals(); Refresh(); });

            // Bottom status + summary
            _statusText = AddText(canvasGo.transform as RectTransform, "", 15, FontStyle.Normal,
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 8), new Vector2(1000, 30), TextAnchor.MiddleCenter);
            _summaryText = AddText(canvasGo.transform as RectTransform, "", 18, FontStyle.Bold,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 80), new Vector2(900, 60), TextAnchor.MiddleCenter);

            Refresh();
        }

        public void Refresh()
        {
            _budgetText.text = $"Budget: {_city.BudgetUsed} / {_city.BudgetMax}";
            _coverageText.text = "Coverage —";
        }

        public void SetMode(string mode) => _modeText.text = mode;

        public void Toast(string msg) => _statusText.text = msg;

        public void ShowSummary(float coverage)
        {
            _summaryText.text = $"Run complete — coverage {coverage:P0}\n(homes with a service within walking distance)";
        }

        // ── UI builders ───────────────────────────────────────────────────────
        static Color ColorFor(string category) => category switch
        {
            "home" => new Color(0.85f, 0.65f, 0.30f),
            "service" => new Color(0.30f, 0.55f, 0.85f),
            "park" => new Color(0.35f, 0.75f, 0.40f),
            _ => new Color(0.6f, 0.6f, 0.6f),
        };

        static RectTransform NewPanel(string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(GameObject.Find("Phase1UI").transform, false);
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        static void AddImage(RectTransform parent, Color c)
        {
            var go = new GameObject("bg", typeof(RectTransform), typeof(Image));
            go.GetComponent<RectTransform>().SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = c;
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }

        static Text AddText(RectTransform parent, string text, int size, FontStyle style,
            Vector2 aMin, Vector2 aMax, Vector2 pivot, Vector2 pos, Vector2 sizeDelta, TextAnchor anchor)
        {
            var go = new GameObject("txt", typeof(RectTransform), typeof(Text));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = aMin; rt.anchorMax = aMax; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = sizeDelta;
            var t = go.GetComponent<Text>();
            t.text = text; t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.fontSize = size; t.fontStyle = style; t.alignment = anchor;
            t.color = new Color(0.95f, 0.96f, 0.98f);
            return t;
        }

        static Button MakeButton(RectTransform parent, string label, Vector2 pos, Vector2 size, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("btn", typeof(RectTransform), typeof(Image), typeof(Button));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = new Vector2(0, 1); rt.anchorMax = new Vector2(0, 1); rt.pivot = new Vector2(0, 1);
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            var img = go.GetComponent<Image>();
            img.color = new Color(0.22f, 0.30f, 0.42f);
            var btn = go.GetComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);
            var txt = AddText(rt, label, 15, FontStyle.Bold, Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero, TextAnchor.MiddleCenter);
            txt.raycastTarget = false;
            return btn;
        }
    }
}
