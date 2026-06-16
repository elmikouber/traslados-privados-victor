self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
            for (const client of lista) {
                if (client.url.includes("admin.html") && "focus" in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow("./admin.html");
            }
        })
    );
});
