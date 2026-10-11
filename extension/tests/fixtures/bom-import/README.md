# BoM producer fixtures

`ibom-public-demo.html` is the unmodified official InteractiveHtmlBom HP34401a OLED demonstration downloaded on 2026-10-11. The fixture retains its producer scripts to verify inert extraction of a real compressed payload; tests never execute those scripts. Source: https://openscopeproject.org/InteractiveHtmlBomDemo/html/hp34401a_oled.html . InteractiveHtmlBom and embedded LZ-string are MIT licensed; copyright notices are preserved inside the file. See https://github.com/openscopeproject/InteractiveHtmlBom/blob/master/LICENSE and https://github.com/pieroxy/lz-string/blob/master/LICENSE .

`studio-producer.json` was generated with the actual local `bomstudio.exporters.export(workspace, BASE, 'Full audit', 'json', True)` from the upstream BoM Studio `examples/BOM_Demo.kicad_pro` project. It is explicitly a draft with synthetic demo manufacturer part numbers. The source checkout was read without editing or saving it. Fixture and producer/source SHA-256 hashes are in `provenance.json`.

The provenance hash list covers downloaded/generated producer outputs, not this documentation or the provenance file itself.
