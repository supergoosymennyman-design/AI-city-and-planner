using UnityEngine;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>Procedural low-poly buildings for Phase 1 (no art assets needed).</summary>
    public static class ProceduralBuildings
    {
        static readonly Color HomeColor = new Color(0.95f, 0.85f, 0.60f);
        static readonly Color ServiceColor = new Color(0.55f, 0.75f, 0.95f);
        static readonly Color ParkColor = new Color(0.55f, 0.85f, 0.55f);
        static readonly Color RoofColor = new Color(0.32f, 0.36f, 0.42f);

        public static GameObject Create(PalettePieceData piece, PlacedPieceData placed)
        {
            if (piece.category == "park")
                return CreatePark(piece, placed);

            float w = piece.footprintMeters[0];
            float d = piece.footprintMeters[1];
            float h = piece.category == "home" ? 6f : 10f;

            var root = new GameObject("bld_" + piece.pieceId);
            root.transform.position = new Vector3(placed.x, 0f, placed.z);
            root.transform.rotation = Quaternion.Euler(0f, placed.rotationY, 0f);

            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "body";
            body.transform.SetParent(root.transform, false);
            body.transform.localScale = new Vector3(w, h, d);
            body.transform.localPosition = new Vector3(0f, h / 2f, 0f);
            body.GetComponent<MeshRenderer>().material = NewMat(ColorFor(piece));

            var roof = GameObject.CreatePrimitive(PrimitiveType.Cube);
            roof.name = "roof";
            roof.transform.SetParent(root.transform, false);
            roof.transform.localScale = new Vector3(w + 0.4f, 0.5f, d + 0.4f);
            roof.transform.localPosition = new Vector3(0f, h + 0.25f, 0f);
            roof.GetComponent<MeshRenderer>().material = NewMat(RoofColor);

            // Ground collider for picking (reuse the cube's collider: expand to footprint)
            var col = body.GetComponent<Collider>();
            UnityEngine.Object.Destroy(col);
            var bc = root.AddComponent<BoxCollider>();
            bc.center = new Vector3(0f, h / 2f, 0f);
            bc.size = new Vector3(w, h, d);

            return root;
        }

        static GameObject CreatePark(PalettePieceData piece, PlacedPieceData placed)
        {
            float w = piece.footprintMeters[0];
            float d = piece.footprintMeters[1];
            var root = new GameObject("park_" + piece.pieceId);
            root.transform.position = new Vector3(placed.x, 0f, placed.z);

            var mat = NewMat(ParkColor);
            var mat2 = NewMat(new Color(0.62f, 0.55f, 0.35f));

            // Flat grass pad
            var pad = GameObject.CreatePrimitive(PrimitiveType.Cube);
            pad.name = "pad";
            pad.transform.SetParent(root.transform, false);
            pad.transform.localScale = new Vector3(w, 0.3f, d);
            pad.transform.localPosition = new Vector3(0f, 0.15f, 0f);
            pad.GetComponent<MeshRenderer>().material = mat;

            // A couple of trees (simple cones on trunks)
            for (int i = 0; i < 4; i++)
            {
                float tx = (i % 2 == 0 ? -1 : 1) * w * 0.25f;
                float tz = (i < 2 ? -1 : 1) * d * 0.25f;
                var tree = GameObject.CreatePrimitive(PrimitiveType.Cube);
                tree.name = "tree";
                tree.transform.SetParent(root.transform, false);
                tree.transform.localScale = new Vector3(0.6f, 1.2f, 0.6f);
                tree.transform.localPosition = new Vector3(tx, 0.8f, tz);
                tree.GetComponent<MeshRenderer>().material = mat2;
            }

            var bc = root.AddComponent<BoxCollider>();
            bc.center = new Vector3(0f, 0.3f, 0f);
            bc.size = new Vector3(w, 0.6f, d);
            return root;
        }

        static Color ColorFor(PalettePieceData piece)
        {
            switch (piece.category)
            {
                case "home": return HomeColor;
                case "service": return ServiceColor;
                case "park": return ParkColor;
                default: return new Color(0.75f, 0.75f, 0.75f);
            }
        }

        static Material NewMat(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            if (m && m.shader) m.color = c;
            return m;
        }
    }
}
