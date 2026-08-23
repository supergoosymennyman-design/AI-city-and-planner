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

            // ── Palette (top-left, scrollable + categorized + thumbnails) ─────
            var pal = Panel(root, "Palette", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -72), new Vector2(240, 0));
            pal.sizeDelta = new Vector2(240, 0);
            Image(pal, new Color(0.10f, 0.12f, 0.17f, 0.94f));

            // Category tabs row.
            string[] cats = { "All", "Home", "Service", "Utility", "Park", "Road", "Deco" };
            string _activeCat = "All";
            var tabs = new GameObject("CategoryTabs", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            tabs.GetComponent<RectTransform>().SetParent(pal, false);
            var tabRt = tabs.GetComponent<RectTransform>();
            tabRt.anchorMin = new Vector2(0, 1); tabRt.anchorMax = new Vector2(1, 1);
            tabRt.pivot = new Vector2(0.5f, 1); tabRt.anchoredPosition = new Vector2(0, -8);
            tabRt.sizeDelta = new Vector2(0, 40);
            var tabLayout = tabs.GetComponent<HorizontalLayoutGroup>();
            tabLayout.padding = new RectOffset(8, 8, 0, 0);
            tabLayout.spacing = 6;
            tabLayout.childControlWidth = true; tabLayout.childControlHeight = true;
            tabLayout.childForceExpandWidth = true; tabLayout.childForceExpandHeight = true;

            foreach (var cat in cats)
            {
                var tab = MakeSmallButton(tabs.GetComponent<RectTransform>(), cat, 34,
                    cat == _activeCat ? new Color(0.25f, 0.45f, 0.75f) : new Color(0.16f, 0.20f, 0.28f),
                    () =>
                    {
                        _activeCat = cat;
                        RefreshPalette(pal, _activeCat);
                    });
                tab.gameObject.name = "Tab_" + cat;
            }

            // Scroll area (between tabs and bottom).
            var scrollGo = new GameObject("Scroll", typeof(RectTransform), typeof(ScrollRect), typeof(Image));
            var scrollRt = scrollGo.GetComponent<RectTransform>();
            scrollRt.SetParent(pal, false);
            scrollRt.anchorMin = new Vector2(0, 0); scrollRt.anchorMax = new Vector2(1, 1);
            scrollRt.offsetMin = new Vector2(8, 8); scrollRt.offsetMax = new Vector2(-8, -56);
            scrollGo.GetComponent<Image>().color = new Color(0, 0, 0, 0.2f);
            var scrollRect = scrollGo.GetComponent<ScrollRect>();
            scrollRect.horizontal = false;
            scrollRect.scrollSensitivity = 40f;

            var viewportGo = new GameObject("Viewport", typeof(RectTransform), typeof(RectMask2D));
            var viewportRt = viewportGo.GetComponent<RectTransform>();
            viewportRt.SetParent(scrollRt, false);
            viewportRt.anchorMin = Vector2.zero; viewportRt.anchorMax = Vector2.one;
            viewportRt.offsetMin = Vector2.zero; viewportRt.offsetMax = Vector2.zero;

            var contentGo = new GameObject("Content", typeof(RectTransform), typeof(VerticalLayoutGroup));
            var contentRt = contentGo.GetComponent<RectTransform>();
            contentRt.SetParent(viewportRt, false);
            contentRt.anchorMin = Vector2.zero; contentRt.anchorMax = new Vector2(1, 0);
            contentRt.pivot = new Vector2(0.5f, 1); contentRt.anchoredPosition = Vector2.zero;
            var contentLayout = contentGo.GetComponent<VerticalLayoutGroup>();
            contentLayout.padding = new RectOffset(4, 4, 4, 4);
            contentLayout.spacing = 6;
            contentLayout.childControlWidth = true;
            contentLayout.childControlHeight = false;
            contentLayout.childForceExpandWidth = true;
            contentLayout.childForceExpandHeight = false;
            contentGo.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.viewport = viewportRt;
            scrollRect.content = contentRt;

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

            _paletteContent = contentRt;
            Refresh();
            RefreshPalette(pal, "All");
        }

        RectTransform _paletteContent;

        void RefreshPalette(RectTransform palRoot, string category)
        {
            if (_paletteContent == null) return;
            foreach (Transform c in _paletteContent) Object.Destroy(c.gameObject);

            foreach (var p in _city.Manifest.palette)
            {
                if (category != "All" && !string.Equals(p.category, category, System.StringComparison.OrdinalIgnoreCase))
                    continue;
                string id = p.pieceId;
                string prefabName = p.prefab;
                var btn = new GameObject("piece_" + id, typeof(RectTransform), typeof(Image), typeof(Button));
                var rt = btn.GetComponent<RectTransform>();
                rt.SetParent(_paletteContent, false);
                var le = btn.AddComponent<LayoutElement>();
                le.minHeight = 56; le.preferredHeight = 56;
                var img = btn.GetComponent<Image>();
                img.color = new Color(0.14f, 0.17f, 0.23f, 1f);
                var button = btn.GetComponent<Button>();
                button.targetGraphic = img;
                button.onClick.AddListener(() => { _city.SelectedPaletteId = id; Toast("Building: " + id); });

                // Thumbnail (from baked PNG or fallback color swatch).
                var thumbGo = new GameObject("thumb", typeof(RectTransform), typeof(Image));
                thumbGo.transform.SetParent(rt, false);
                var thumbRt = thumbGo.GetComponent<RectTransform>();
                thumbRt.anchorMin = new Vector2(0, 0); thumbRt.anchorMax = new Vector2(0, 1);
                thumbRt.pivot = new Vector2(0, 0.5f); thumbRt.anchoredPosition = new Vector2(6, 0);
                thumbRt.sizeDelta = new Vector2(64, -8);
                var thumbImg = thumbGo.GetComponent<Image>();
                var tex = Resources.Load<Texture2D>("PaletteThumbs/" + prefabName);
                if (tex != null)
                    thumbImg.sprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f));
                else
                    thumbImg.color = ColorFor(p.category);

                // Label: name + cost.
                var labelGo = new GameObject("label", typeof(RectTransform), typeof(TextMeshProUGUI));
                labelGo.transform.SetParent(rt, false);
                var labelRt = labelGo.GetComponent<RectTransform>();
                labelRt.anchorMin = new Vector2(0, 0); labelRt.anchorMax = new Vector2(1, 1);
                labelRt.offsetMin = new Vector2(76, 4); labelRt.offsetMax = new Vector2(-8, -4);
                var tmp = labelGo.GetComponent<TextMeshProUGUI>();
                tmp.text = $"{PrettyName(id)}\n${p.cost}";
                tmp.fontSize = 14;
                tmp.fontStyle = FontStyles.Bold;
                tmp.color = new Color(0.92f, 0.93f, 0.96f, 1f);
                tmp.alignment = TextAlignmentOptions.MidlineLeft;
                tmp.textWrappingMode = TextWrappingModes.NoWrap;
                tmp.raycastTarget = false;
            }
        }

        static string PrettyName(string id) => System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(id.Replace('_', ' '));

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

        /// <summary>Compact tab button (category chips) with a centered label.</summary>
        static Button MakeSmallButton(RectTransform parent, string label, float minHeight, Color color, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("tabbtn", typeof(RectTransform), typeof(Image), typeof(Button));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            var le = go.AddComponent<LayoutElement>();
            le.minHeight = minHeight; le.preferredHeight = minHeight;
            le.flexibleWidth = 1f;
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
            tmp.fontSize = 13;
            tmp.fontStyle = FontStyles.Bold;
            tmp.color = new Color(1f, 1f, 1f, 0.95f);
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.textWrappingMode = TextWrappingModes.NoWrap;
            tmp.raycastTarget = false;
            return btn;
        }

        static Button MakeButton(RectTransform parent, string label, float minHeight, Color color, UnityEngine.Events.UnityAction onClick)        {
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
