using System;
using System.Collections.Generic;

namespace AI2School.Agents
{
    /// <summary>Kind of a road palette piece (road catalog geometry spec).</summary>
    public enum RoadPieceKind
    {
        None,      // not a road
        Straight,  // 2 opposite connections
        Curve,     // 2 perpendicular connections (quarter arc)
        Junction,  // 4 connections through a center node
        End,       // 1 dead-end stub
    }

    /// <summary>Engine-agnostic input for RoadNetwork.Build — mirrors a placed road piece.</summary>
    public struct RoadPieceInput
    {
        public string PieceId;
        public float X;
        public float Z;
        public float RotationY;

        public RoadPieceInput(string pieceId, float x, float z, float rotationY = 0f)
        {
            PieceId = pieceId; X = x; Z = z; RotationY = rotationY;
        }
    }

    public struct RoadNodeData
    {
        public Vec2 Pos;
        public List<int> Edges;   // edge indices incident to this node
        public int Degree => Edges != null ? Edges.Count : 0;
    }

    public struct RoadEdgeData
    {
        public int A, B;          // node indices (junction star edges: A = port node, B = center node)
        public Vec2[] Midline;    // world-space centerline points (x,z)
        public float Length;      // metres along the midline
        public bool HasCrossing;  // road_crossing → cars yield to pedestrians
        public Vec2 CrossingCenter;
        public Vec2 CrossingHalf; // half extents (x,z) of the crossing zone
        public bool IsStub;       // dead-end stub (road_end)
    }

    /// <summary>
    /// A road network inferred from placed road pieces. Nodes are merged at
    /// coincident ports (within tolerance); junction pieces add a center node
    /// plus a star of short edges so cars can turn. Pure C# (no Unity types),
    /// deterministic — the same pieces always produce the same graph.
    /// </summary>
    public sealed class RoadNetwork
    {
        const float MergeTolerance = 0.75f;
        const int CurveSamples = 10;

        public List<RoadNodeData> Nodes { get; } = new List<RoadNodeData>();
        public List<RoadEdgeData> Edges { get; } = new List<RoadEdgeData>();
        public int RoadPieceCount { get; private set; }
        public bool IsEmpty => Edges.Count == 0;

        // pieceId → kind + footprint geometry (road catalog spec; mirrors CityBase.manifest.json)
        static readonly Dictionary<string, (RoadPieceKind kind, float w, float d)> RoadSpec =
            new Dictionary<string, (RoadPieceKind, float, float)>
            {
                ["road_straight"] = (RoadPieceKind.Straight, 12f, 6f),
                ["road_crossing"] = (RoadPieceKind.Straight, 12f, 6f),
                ["road_bridge"] = (RoadPieceKind.Straight, 12f, 8f),
                ["road_driveway"] = (RoadPieceKind.Straight, 8f, 6f),
                ["road_curve"] = (RoadPieceKind.Curve, 12f, 12f),
                ["road_cross"] = (RoadPieceKind.Junction, 12f, 12f),
                ["road_junction"] = (RoadPieceKind.Junction, 12f, 12f),
                ["road_end"] = (RoadPieceKind.End, 8f, 8f),
            };

        public static bool IsRoadPiece(string pieceId) => RoadSpec.ContainsKey(pieceId);
        public static RoadPieceKind KindFor(string pieceId) =>
            RoadSpec.TryGetValue(pieceId, out var s) ? s.kind : RoadPieceKind.None;

        // Local connection directions per kind (piece-local frame, before rotation).
        static (int dx, int dz)[] LocalDirs(RoadPieceKind kind) => kind switch
        {
            RoadPieceKind.Straight => new[] { (1, 0), (-1, 0) },
            RoadPieceKind.Curve => new[] { (1, 0), (0, 1) },
            RoadPieceKind.Junction => new[] { (1, 0), (-1, 0), (0, 1), (0, -1) },
            RoadPieceKind.End => new[] { (1, 0) },
            _ => Array.Empty<(int, int)>(),
        };

        public static RoadNetwork Build(IReadOnlyList<RoadPieceInput> pieces)
        {
            var net = new RoadNetwork();
            if (pieces == null) return net;

            foreach (var p in pieces)
            {
                if (!RoadSpec.TryGetValue(p.PieceId, out var spec)) continue;
                net.RoadPieceCount++;

                float rot = ((p.RotationY % 360f) + 360f) % 360f;
                float rotRad = rot * MathF.PI / 180f;
                var center = new Vec2(p.X, p.Z);
                var dirs = LocalDirs(spec.kind);

                var ports = new List<(int node, Vec2 pos)>();
                foreach (var (dx, dz) in dirs)
                {
                    var wd = RotateDir(dx, dz, rotRad);
                    float half = Math.Abs(wd.X) > 0.5f ? RotHalfX(spec.w, spec.d, rotRad) : RotHalfZ(spec.w, spec.d, rotRad);
                    var portPos = center + wd * half;
                    int node = net.NodeAtOrCreate(portPos);
                    ports.Add((node, portPos));
                }

                switch (spec.kind)
                {
                    case RoadPieceKind.Straight:
                        if (ports.Count >= 2)
                            net.AddEdge(ports[0].node, ports[1].node, ports[0].pos, ports[1].pos,
                                hasCrossing: p.PieceId == "road_crossing", center, spec.w, spec.d, rotRad);
                        break;
                    case RoadPieceKind.Curve:
                        if (ports.Count >= 2)
                            net.AddCurveEdge(ports[0].node, ports[1].node, ports[0].pos, ports[1].pos, center);
                        break;
                    case RoadPieceKind.Junction:
                    {
                        int cn = net.NodeAtOrCreate(center);
                        foreach (var (node, pos) in ports)
                            net.AddEdge(cn, node, center, pos, false, center, spec.w, spec.d, rotRad);
                        break;
                    }
                    case RoadPieceKind.End:
                    {
                        int sn = net.NodeAtOrCreate(center);
                        net.AddEdge(ports[0].node, sn, ports[0].pos, center, false, center, spec.w, spec.d, rotRad, stub: true);
                        break;
                    }
                }
            }
            return net;
        }

        int NodeAtOrCreate(Vec2 pos)
        {
            for (int i = 0; i < Nodes.Count; i++)
                if ((Nodes[i].Pos - pos).Magnitude < MergeTolerance) return i;
            Nodes.Add(new RoadNodeData { Pos = pos, Edges = new List<int>() });
            return Nodes.Count - 1;
        }

        void AddEdge(int a, int b, Vec2 pa, Vec2 pb, bool hasCrossing, Vec2 center, float w, float d, float rotRad,
            bool stub = false)
        {
            var mid = new[] { pa, pb };
            var e = new RoadEdgeData
            {
                A = a, B = b,
                Midline = mid,
                Length = (pb - pa).Magnitude,
                HasCrossing = hasCrossing,
                CrossingCenter = center,
                CrossingHalf = new Vec2(RotHalfX(w, d, rotRad), RotHalfZ(w, d, rotRad)),
                IsStub = stub,
            };
            int idx = Edges.Count;
            Edges.Add(e);
            Nodes[a].Edges.Add(idx);
            Nodes[b].Edges.Add(idx);
        }

        void AddCurveEdge(int a, int b, Vec2 pa, Vec2 pb, Vec2 center)
        {
            var pts = new List<Vec2>(CurveSamples + 1);
            float angA = MathF.Atan2(pa.Y - center.Y, pa.X - center.X);
            float angB = MathF.Atan2(pb.Y - center.Y, pb.X - center.X);
            float sweep = angB - angA;
            while (sweep > MathF.PI) sweep -= 2f * MathF.PI;
            while (sweep < -MathF.PI) sweep += 2f * MathF.PI;
            float r = (pa - center).Magnitude;
            for (int i = 0; i <= CurveSamples; i++)
            {
                float ang = angA + sweep * (i / (float)CurveSamples);
                pts.Add(center + new Vec2(MathF.Cos(ang), MathF.Sin(ang)) * r);
            }
            var e = new RoadEdgeData
            {
                A = a, B = b,
                Midline = pts.ToArray(),
                Length = PolyLength(pts),
                HasCrossing = false,
                IsStub = false,
            };
            int idx = Edges.Count;
            Edges.Add(e);
            Nodes[a].Edges.Add(idx);
            Nodes[b].Edges.Add(idx);
        }

        // ── Geometry helpers ────────────────────────────────────────────────
        static Vec2 RotateDir(float dx, float dz, float rotRad)
        {
            float c = MathF.Cos(rotRad), s = MathF.Sin(rotRad);
            return new Vec2(dx * c + dz * s, -dx * s + dz * c);
        }

        static float RotHalfX(float w, float d, float rotRad)
        {
            float c = MathF.Abs(MathF.Cos(rotRad)), s = MathF.Abs(MathF.Sin(rotRad));
            return c * (w / 2f) + s * (d / 2f);
        }

        static float RotHalfZ(float w, float d, float rotRad)
        {
            float c = MathF.Abs(MathF.Cos(rotRad)), s = MathF.Abs(MathF.Sin(rotRad));
            return s * (w / 2f) + c * (d / 2f);
        }

        static float PolyLength(List<Vec2> pts)
        {
            float len = 0f;
            for (int i = 0; i < pts.Count - 1; i++) len += (pts[i + 1] - pts[i]).Magnitude;
            return len;
        }
    }
}
