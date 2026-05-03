using System;
using System.Collections.Generic;

namespace Boarder.Core
{
    public static class ServiceLocator
    {
        static readonly Dictionary<Type, object> _services = new();

        public static void Register<T>(T service) where T : class => _services[typeof(T)] = service;

        public static T Get<T>() where T : class => (T)_services[typeof(T)];

        public static bool TryGet<T>(out T service) where T : class
        {
            if (_services.TryGetValue(typeof(T), out var s)) { service = (T)s; return true; }
            service = null;
            return false;
        }

        public static void Clear() => _services.Clear();
    }
}
