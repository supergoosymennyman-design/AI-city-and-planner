namespace AI2School.Core.Capability
{
    /// <summary>
    /// A tiny JSON-like value used for capability Parameters/TrainingTrace —
    /// engine-agnostic, mirrors the JsonNode in the frozen contract so the
    /// external workshop team's JSON blobs deserialize 1:1 into this shape.
    /// </summary>
    public readonly struct JsonValue
    {
        public enum Kind { Number, Str, Bool, Null }

        public readonly Kind ValueKind;
        public readonly double Number;
        public readonly string Str;
        public readonly bool Bool;

        JsonValue(Kind kind, double number = 0, string str = null, bool boolean = false)
        {
            ValueKind = kind;
            Number = number;
            Str = str;
            Bool = boolean;
        }

        public static JsonValue FromNumber(double v) => new JsonValue(Kind.Number, number: v);
        public static JsonValue FromString(string v) => new JsonValue(Kind.Str, str: v);
        public static JsonValue FromBool(bool v) => new JsonValue(Kind.Bool, boolean: v);
        public static JsonValue FromNull() => new JsonValue(Kind.Null);

        public bool IsNumber => ValueKind == Kind.Number;
        public bool IsString => ValueKind == Kind.Str;
        public bool IsBool => ValueKind == Kind.Bool;

        public double AsNumber(double def = 0) => ValueKind == Kind.Number ? Number : def;
        public string AsString(string def = null) => ValueKind == Kind.Str ? Str : def;
        public bool AsBool(bool def = false) => ValueKind == Kind.Bool ? Bool : def;

        public override string ToString() => ValueKind switch
        {
            Kind.Number => Number.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Kind.Str => Str ?? "null",
            Kind.Bool => Bool ? "true" : "false",
            _ => "null",
        };
    }
}
