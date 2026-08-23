using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace AI2School.Game
{
    /// <summary>
    /// Phase 1 HUD on the MinimalCity path — TextMeshPro + LayoutGroups (no
    /// hand-rolled anchors). Top bar: mode / budget / coverage. Left: palette.
    /// Right: Run/Save/Load. All touch targets ≥ 44px. NO coach.
    /// </summary>
    public class MinimalHUD
    {
        readonly MinimalCity _city;
        readonly TextMeshProUGUI _budgetText;
        readonly TextMeshProUGUI _modeText;
        readonly TextMeshProUGUI _coverageText;
        readonly TextMeshProUGUI _statusText;
        readonly TextMeshProUGUI _summaryText;

        public MinimalHUD(MinimalCity city)
        {
            _city = city;

            var canvasGo = new GameObject("MinimalHUD");
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 800);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();
            EnsureEventSystem();
            var root = canvasGo.GetComponent<RectTransform>();

            // ── Top bar (full width, anchored to top) ─────────────────────────
            var top = Panel(root, "TopBar", new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(0, 56));
            Image(top, new Color(0.07f, 0.09f, 0.13f, 0.96f));
            var topLayout = top.gameObject.AddComponent<HorizontalLayoutGroup>();
            topLayout.padding = new RectOffset(20, 20, 0, 0);
            topLayout.spacing = 24;
            topLayout.childAlignment = TextAnchor.MiddleLeft;
            topLayout.childControlWidth = false;
            topLayout.childControlHeight = true;
            topLayout.childForceExpandWidth = true;
            topLayout.childForceExpandHeight = true;

            _modeText = Tmp(top, "PLANNING", 18, FontStyles.Bold, new Color(0.35f, 0.75f, 1f), TextAlignmentOptions.Left, true);
            _budgetText = Tmp(top, "Budget", 17, FontStyles.Bold, new Color(0.95f, 0.96f, 0.98f), TextAlignmentOptions.Center, true);
            _coverageText = Tmp(top, "Coverage —", 17, FontStyles.Bold, new Color(0.45f, 0.92f, 0.65f), TextAlignmentOptions.Right, true);

            // ── Palette (top-left) ────────────────────────────────────────────
            var pal = Panel(root, "Palette", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -72), new Vector2(176, 0));
            pal.sizeDelta = new Vector2(176, 0);
            Image(pal, new Color(0.10f, 0.12f, 0.17f, 0.92f));
            var palLayout = pal.gameObject.AddComponent<VerticalLayoutGroup>();
            palLayout.padding = new RectOffset(12, 12, 12, 12);
            palLayout.spacing = 8;
            palLayout.childAlignment = TextAnchor.UpperCenter;
            palLayout.childControlWidth = true;
            palLayout.childControlHeight = false;
            palLayout.childForceExpandWidth = true;
            palLayout.childForceExpandHeight = false;

            var palTitle = Tmp(pal, "Build", 15, FontStyles.Bold, new Color(0.85f, 0.87f, 0.92f), TextAlignmentOptions.Center, false);
            palTitle.gameObject.AddComponent<LayoutElement>().minHeight = 30;
            foreach (var p in _city.Manifest.palette)
            {
                string id = p.pieceId;
                var btn = MakeButton(pal, $"{p.pieceId}   ${p.cost}", 48, ColorFor(p.category),
                    () => { _city.SelectedPaletteId = id; Toast("Building: " + id); });
                btn.GetComponent<Image>().color = ColorFor(p.category);
            }

            // ── Actions (top-right) ───────────────────────────────────────────
            var actions = Panel(root, "Actions", new Vector2(1, 1), new Vector2(1, 1), new Vector2(1, 1), new Vector2(-16, -72), new Vector2(160, 0));
            Image(actions, new Color(0.10f, 0.12f, 0.17f, 0.92f));
            var actLayout = actions.gameObject.AddComponent<VerticalLayoutGroup>();
            actLayout.padding = new RectOffset(12, 12, 12, 12);
            actLayout.spacing = 8;
            actLayout.childAlignment = TextAnchor.UpperCenter;
            actLayout.childControlWidth = true;
            actLayout.childControlHeight = false;
            actLayout.childForceExpandWidth = true;
            actLayout.childForceExpandHeight = false;

            MakeButton(actions, "Run", 56, new Color(0.20f, 0.45f, 0.75f), () => _city.StartSimulation());
            MakeButton(actions, "Save", 48, new Color(0.16f, 0.24f, 0.36f), () => { _city.AutoSave(); Toast("Saved"); });
            MakeButton(actions, "Load", 48, new Color(0.16f, 0.24f, 0.36f), () => { _city.LoadSave(); _city.ApplyVisuals(); Refresh(); Toast("Loaded"); });

            // ── Bottom status + summary ───────────────────────────────────────
            _statusText = Tmp(root, "", 16, FontStyles.Normal, new Color(0.85f, 0.87f, 0.92f), TextAlignmentOptions.Center, false);
            var stRt = _statusText.rectTransform;
            stRt.anchorMin = new Vector2(0.5f, 0); stRt.anchorMax = new Vector2(0.5f, 0);
            stRt.pivot = new Vector2(0.5f, 0); stRt.anchoredPosition = new Vector2(0, 10);
            stRt.sizeDelta = new Vector2(1100, 34);

            _summaryText = Tmp(root, "", 20, FontStyles.Bold, new Color(0.95f, 0.96f, 0.98f), TextAlignmentOptions.Center, false);
            var smRt = _summaryText.rectTransform;
            smRt.anchorMin = new Vector2(0.5f, 0.5f); smRt.anchorMax = new Vector2(0.5f, 0.5f);
            smRt.pivot = new Vector2(0.5f, 0.5f); smRt.anchoredPosition = new Vector2(0, 90);
            smRt.sizeDelta = new Vector2(900, 70);

            Refresh();
        }

        public void Refresh()
        {
            _budgetText.text = $"Budget  {_city.BudgetUsed} / {_city.BudgetMax}";
            _coverageText.text = _city.LastCoverage > 0f
                ? $"Coverage {_city.LastCoverage:P0}"
                : "Coverage —";
        }

        public void SetMode(string mode) => _modeText.text = mode.ToUpperInvariant();

        public void Toast(string msg) => _statusText.text = msg;

        public void ShowSummary(float coverage)
        {
            _summaryText.text = $"Run complete — coverage {coverage:P0}\n(homes with a service within walking distance)";
        }

        // ── Builders ──────────────────────────────────────────────────────────
        static void EnsureEventSystem()
        {
            if (Object.FindAnyObjectByType<EventSystem>() == null)
            {
                var go = new GameObject("EventSystem");
                go.AddComponent<EventSystem>();
                go.AddComponent<StandaloneInputModule>();
            }
        }

        static RectTransform Panel(RectTransform parent, string name, Vector2 aMin, Vector2 aMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = aMin; rt.anchorMax = aMax; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        static void Image(RectTransform parent, Color c)
        {
            var go = new GameObject("bg", typeof(RectTransform), typeof(Image));
            go.GetComponent<RectTransform>().SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = c;
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }

        static TextMeshProUGUI Tmp(RectTransform parent, string text, int size, FontStyles style, Color color,
            TextAlignmentOptions align, bool flexible)
        {
            var go = new GameObject("txt", typeof(RectTransform), typeof(TextMeshProUGUI));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            var tmp = go.GetComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = size;
            tmp.fontStyle = style;
            tmp.color = color;
            tmp.alignment = align;
            tmp.textWrappingMode = TextWrappingModes.NoWrap;   // non-obsolete replacement for enableWordWrapping=false
            if (flexible)
            {
                var le = go.AddComponent<LayoutElement>();
                le.flexibleWidth = 1f;
            }
            else
            {
                rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
                rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
            }
            return tmp;
        }

        static Button MakeButton(RectTransform parent, string label, float minHeight, Color color, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("btn", typeof(RectTransform), typeof(Image), typeof(Button));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            var le = go.AddComponent<LayoutElement>();
            le.minHeight = minHeight;
            le.preferredHeight = minHeight;
            var img = go.GetComponent<Image>();
            img.color = color;
            var btn = go.GetComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);

            var tmpGo = new GameObject("label", typeof(RectTransform), typeof(TextMeshProUGUI));
            tmpGo.transform.SetParent(go.transform, false);
            var tmpRt = tmpGo.GetComponent<RectTransform>();
            tmpRt.anchorMin = Vector2.zero; tmpRt.anchorMax = Vector2.one;
            tmpRt.offsetMin = Vector2.zero; tmpRt.offsetMax = Vector2.zero;
            var tmp = tmpGo.GetComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 17;
            tmp.fontStyle = FontStyles.Bold;
            tmp.color = new Color(1f, 1f, 1f, 0.95f);
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.textWrappingMode = TextWrappingModes.NoWrap;
            tmp.raycastTarget = false;
            return btn;
        }

        static Color ColorFor(string category) => category switch
        {
            "home" => new Color(0.75f, 0.55f, 0.25f),
            "service" => new Color(0.25f, 0.45f, 0.75f),
            "park" => new Color(0.30f, 0.65f, 0.35f),
            _ => new Color(0.45f, 0.47f, 0.52f),
        };
    }
}
