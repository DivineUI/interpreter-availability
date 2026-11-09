(function () {
  var input = document.getElementById("url");
  var box = document.getElementById("qr");
  var label = document.getElementById("urltext");

  // Default: this site's home page (the folder this page is in).
  input.value = new URL("./", location.href).href;

  function draw() {
    var value = input.value.trim();
    if (!value) { box.innerHTML = ""; label.textContent = ""; return; }
    var qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    label.textContent = value;
  }

  input.addEventListener("input", draw);
  document.getElementById("print").addEventListener("click", function () { window.print(); });
  draw();
})();
